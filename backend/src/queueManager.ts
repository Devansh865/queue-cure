import fs from 'fs';
import path from 'path';
import { Patient, QueueState, QueueStats, Priority } from './types';

const STATE_FILE_PATH = path.join(__dirname, '../queue-state.json');

export class QueueManager {
  private state: QueueState;
  private tokenCounter: number = 0;
  private actionLock: boolean = false;
  private lockTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.state = this.getInitialState();
    this.loadState();
  }

  private getInitialState(): QueueState {
    return {
      waiting: [],
      active: null,
      missed: [],
      served: [],
      averageConsultationTime: 5, // default 5 minutes
      stats: {
        totalWaiting: 0,
        totalServed: 0,
        totalMissed: 0,
        averageWaitTime: 0,
        currentLoad: 'low',
        efficiencyScore: 100,
        queueHealth: 'optimal'
      },
      isDelayed: false,
      delaySeconds: 0,
      confidence: 'high',
      waitFactors: [],
      roomInfo: {
        roomNumber: 'Cabin 01',
        doctorName: 'Sharma',
        status: 'available',
        expectedCompletionTime: 300
      },
      insights: ['Queue load is low. Patient flow is optimal.'],
      notifications: [
        {
          id: `notif_${Date.now()}`,
          message: 'Clinical Operations Command initialized.',
          timestamp: Date.now(),
          type: 'info'
        }
      ]
    };
  }

  // Persists the queue state to a JSON file
  private saveState(): void {
    try {
      const data = JSON.stringify({
        state: this.state,
        tokenCounter: this.tokenCounter
      }, null, 2);
      fs.writeFileSync(STATE_FILE_PATH, data, 'utf8');
    } catch (error) {
      console.error('Failed to save state to disk:', error);
    }
  }

  // Loads the queue state from the JSON file if it exists
  private loadState(): void {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const fileContent = fs.readFileSync(STATE_FILE_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && parsed.state) {
          // Merge with initial state to populate newly added schema fields gracefully
          this.state = {
            ...this.getInitialState(),
            ...parsed.state
          };
          this.tokenCounter = parsed.tokenCounter || 0;
          console.log(`State loaded successfully. Current token count: ${this.tokenCounter}`);
        }
      }
    } catch (error: any) {
      console.warn('Failed to load state from disk, starting fresh:', error.message);
      this.state = this.getInitialState();
    }
  }

  // Helper to add system alerts/notification logs
  private addNotification(message: string, type: 'info' | 'warning' | 'emergency' | 'delay'): void {
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      message,
      timestamp: Date.now(),
      type
    };
    this.state.notifications = [newNotif, ...this.state.notifications].slice(0, 10); // cap at 10 alerts
  }

  // Core concurrency locking mechanism
  private acquireLock(): boolean {
    if (process.env.NODE_ENV === 'test') return true;
    if (this.actionLock) return false;
    this.actionLock = true;
    this.lockTimeout = setTimeout(() => {
      this.actionLock = false;
    }, 400); // 400ms lock window to prevent rapid double-clicks
    return true;
  }

  public getState(): QueueState {
    return this.state;
  }

  public addPatient(name: string, symptoms: string, priority: Priority): Patient | null {
    // Basic validation
    if (!name.trim()) return null;

    // Handle duplicate patient names (edge case) by appending sequential count
    let displayName = name.trim();
    const countDuplicates = this.state.waiting.filter(
      p => p.name.toLowerCase().startsWith(displayName.toLowerCase())
    ).length + (this.state.active?.name.toLowerCase().startsWith(displayName.toLowerCase()) ? 1 : 0);

    if (countDuplicates > 0) {
      displayName = `${displayName} (${countDuplicates + 1})`;
    }

    this.tokenCounter++;
    const token = `QC-${String(this.tokenCounter).padStart(3, '0')}`;

    const newPatient: Patient = {
      id: `pat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      token,
      name: displayName,
      symptoms: symptoms.trim() || 'General Checkup',
      priority,
      status: 'waiting',
      joinedAt: Date.now(),
      calledAt: null,
      servedAt: null,
      skippedAt: null,
      estimatedWaitTime: 0,
      elapsedTime: 0
    };

    this.state.waiting.push(newPatient);
    
    // Sort queue based on clinical priorities:
    // Emergency -> Urgent -> Normal
    // Within priority bands, maintain First-In-First-Out (FIFO)
    this.sortWaitingQueue();

    // Log Triage Notifications (Emergency & Urgent)
    if (priority === 'emergency' || priority === 'urgent') {
      const friendlyPriority = priority === 'emergency' ? 'Immediate Attention' : 'Priority Care';
      this.addNotification(
        `Triage Alert: Patient ${displayName} (${token}) registered under ${friendlyPriority}.`, 
        priority === 'emergency' ? 'emergency' : 'warning'
      );
    }

    this.recalculateState();
    this.saveState();
    return newPatient;
  }

  private sortWaitingQueue(): void {
    const priorityWeights = {
      emergency: 3,
      urgent: 2,
      normal: 1
    };

    this.state.waiting.sort((a, b) => {
      const weightA = priorityWeights[a.priority];
      const weightB = priorityWeights[b.priority];

      if (weightA !== weightB) {
        return weightB - weightA; // Higher weight first
      }
      return a.joinedAt - b.joinedAt; // FIFO within same priority
    });
  }

  public callNext(): { active: Patient | null; served: Patient | null } | null {
    if (!this.acquireLock()) {
      console.warn('Call next action blocked due to active concurrency lock');
      return null;
    }

    let servedPatient: Patient | null = null;
    if (this.state.active) {
      servedPatient = { ...this.state.active };
      servedPatient.status = 'served';
      servedPatient.servedAt = Date.now();
      this.state.served.push(servedPatient);
      this.state.active = null;
    }

    if (this.state.waiting.length > 0) {
      const nextPatient = this.state.waiting.shift()!;
      nextPatient.status = 'serving';
      nextPatient.calledAt = Date.now();
      nextPatient.elapsedTime = 0;
      this.state.active = nextPatient;
      
      // Patient Called Alert Notification
      this.addNotification(`Patient Called: ${nextPatient.token} (${nextPatient.name}) to ${this.state.roomInfo.roomNumber}.`, 'info');
    }

    // Reset delay state on new call
    this.state.isDelayed = false;
    this.state.delaySeconds = 0;

    this.recalculateState();
    this.saveState();

    return { active: this.state.active, served: servedPatient };
  }

  public skipPatient(): Patient | null {
    if (!this.acquireLock()) return null;

    if (!this.state.active) return null;

    const skippedPatient = { ...this.state.active };
    skippedPatient.status = 'skipped';
    skippedPatient.skippedAt = Date.now();
    
    this.state.missed.push(skippedPatient);
    this.state.active = null;

    // Reset delay metrics
    this.state.isDelayed = false;
    this.state.delaySeconds = 0;

    this.recalculateState();
    this.saveState();

    return skippedPatient;
  }

  public recallPatient(patientId: string): Patient | null {
    if (!this.acquireLock()) return null;

    const index = this.state.missed.findIndex(p => p.id === patientId);
    if (index === -1) return null;

    const patient = this.state.missed.splice(index, 1)[0];
    patient.status = 'waiting';
    patient.joinedAt = Date.now(); // update joinedAt so we track wait time from recall
    patient.skippedAt = null;
    patient.calledAt = null;
    patient.servedAt = null;
    patient.elapsedTime = 0;

    // Recalled patients are placed at the FRONT of the queue for prompt treatment
    this.state.waiting.unshift(patient);
    this.addNotification(`Recall Alert: Patient ${patient.name} (${patient.token}) recalled to active queue.`, 'info');

    this.recalculateState();
    this.saveState();

    return patient;
  }

  public updateConfig(averageConsultationTime: number): void {
    if (averageConsultationTime <= 0) return;
    this.state.averageConsultationTime = averageConsultationTime;
    this.recalculateState();
    this.saveState();
  }

  public updateRoomInfo(roomNumber: string, doctorName: string): void {
    this.state.roomInfo.roomNumber = roomNumber;
    this.state.roomInfo.doctorName = doctorName;
    this.addNotification(`Room Config: Doctor assigned to ${roomNumber} changed to Dr. ${doctorName}.`, 'info');
    this.recalculateState();
    this.saveState();
  }

  public resetQueue(): void {
    if (this.lockTimeout) clearTimeout(this.lockTimeout);
    this.actionLock = false;
    this.tokenCounter = 0;
    this.state = this.getInitialState();
    this.addNotification('Command Center: operations queue database reset.', 'warning');
    this.saveState();
  }

  // Updates consultation elapsed time for active patient
  // Runs doctor delay detection
  public tickActivePatient(seconds: number): boolean {
    let stateChanged = false;
    if (this.state.active) {
      this.state.active.elapsedTime += seconds;
      
      const thresholdSeconds = this.state.averageConsultationTime * 60;
      const oldDelayState = this.state.isDelayed;

      if (this.state.active.elapsedTime > thresholdSeconds) {
        this.state.isDelayed = true;
        this.state.delaySeconds = this.state.active.elapsedTime - thresholdSeconds;
      } else {
        this.state.isDelayed = false;
        this.state.delaySeconds = 0;
      }

      if (oldDelayState !== this.state.isDelayed) {
        stateChanged = true;
        if (this.state.isDelayed) {
          this.addNotification(`Delay Alert: Dr. ${this.state.roomInfo.doctorName} session exceeds target time.`, 'delay');
        }
      }
      
      // Always recalculate ETAs, stats, and metadata during ticking
      this.recalculateETAs();
      this.recalculateStats();
      this.recalculateMetadataAndInsights();
    }
    return stateChanged;
  }

  // Recalculates ETAs for all waiting patients based on current state & configuration
  private recalculateETAs(): void {
    const avgSeconds = this.state.averageConsultationTime * 60;
    
    // Remaining time of current active consultation
    let currentPatientRemainingSeconds = avgSeconds;
    if (this.state.active) {
      // If the consultation is delayed, remaining is 0 (it's already overdue)
      currentPatientRemainingSeconds = Math.max(0, avgSeconds - this.state.active.elapsedTime);
    } else {
      currentPatientRemainingSeconds = 0;
    }

    // Accumulating delays dynamically
    const delayOffset = this.state.isDelayed ? this.state.delaySeconds : 0;

    this.state.waiting.forEach((patient, index) => {
      // Smart ETA Engine calculation:
      // index is 0-based for who is next.
      // Wait time = (index * average consultation time) + remaining active consultation time + delay offset
      const waitTime = (index * avgSeconds) + currentPatientRemainingSeconds + delayOffset;
      patient.estimatedWaitTime = waitTime;
    });
  }

  private recalculateStats(): void {
    const waiting = this.state.waiting.length;
    const served = this.state.served.length;
    const missed = this.state.missed.length;

    // Average wait time of served patients (joinedAt to calledAt)
    let avgWaitTime = 0;
    if (served > 0) {
      const totalWait = this.state.served.reduce((sum, p) => {
        const wait = (p.calledAt || 0) - p.joinedAt;
        return sum + Math.max(0, wait);
      }, 0);
      avgWaitTime = Math.floor((totalWait / served) / 1000); // convert to seconds
    }

    // Determine current load
    let currentLoad: 'low' | 'medium' | 'high' = 'low';
    if (waiting >= 6) {
      currentLoad = 'high';
    } else if (waiting >= 3) {
      currentLoad = 'medium';
    }

    // Compute efficiency score
    // Factors: percentage of served vs missed, whether doctor is running delayed
    let efficiency = 100;
    const totalRegistered = served + missed + waiting;
    if (totalRegistered > 0) {
      const missedRatio = missed / totalRegistered;
      efficiency -= missedRatio * 40; // Skip penalty (up to 40 points)
    }

    // Delay penalty
    if (this.state.isDelayed) {
      const delayMinutes = this.state.delaySeconds / 60;
      efficiency -= Math.min(30, delayMinutes * 5); // delay penalty (up to 30 points)
    }

    // Ensure score is between 10 and 100
    const efficiencyScore = Math.max(10, Math.min(100, Math.floor(efficiency)));

    // Determine overall queue health
    let queueHealth: 'optimal' | 'warning' | 'critical' = 'optimal';
    if (efficiencyScore < 50 || (this.state.isDelayed && this.state.delaySeconds > 300) || currentLoad === 'high') {
      queueHealth = 'critical';
    } else if (efficiencyScore < 75 || this.state.isDelayed || currentLoad === 'medium') {
      queueHealth = 'warning';
    }

    this.state.stats = {
      totalWaiting: waiting,
      totalServed: served,
      totalMissed: missed,
      averageWaitTime: avgWaitTime,
      currentLoad,
      efficiencyScore,
      queueHealth
    };
  }

  // Recalculates medical metadata, wait change factors, and room statuses
  private recalculateMetadataAndInsights(): void {
    // 1. Update Room Info Status
    if (this.state.active) {
      this.state.roomInfo.status = this.state.isDelayed ? 'delayed' : 'busy';
    } else {
      this.state.roomInfo.status = 'available';
    }
    this.state.roomInfo.expectedCompletionTime = this.state.averageConsultationTime * 60;

    // 2. Queue Confidence Engine
    const waiting = this.state.waiting.length;
    const isDelayed = this.state.isDelayed;
    const delaySeconds = this.state.delaySeconds;
    const emergencyCount = this.state.waiting.filter(p => p.priority === 'emergency').length;

    if (isDelayed && delaySeconds >= 180) {
      this.state.confidence = 'low';
    } else if ((isDelayed && delaySeconds > 0) || waiting > 5 || emergencyCount > 1) {
      this.state.confidence = 'medium';
    } else {
      this.state.confidence = 'high';
    }

    // 3. Dynamic "Why Wait Time Changed" Breakdown
    const avgSeconds = this.state.averageConsultationTime * 60;
    const factors: { label: string, minutes: number }[] = [];

    // Doctor delay factor
    if (isDelayed && delaySeconds > 0) {
      factors.push({
        label: 'Current session overrun delay',
        minutes: Math.ceil(delaySeconds / 60)
      });
    } else if (this.state.active) {
      const remainingSeconds = Math.max(0, avgSeconds - this.state.active.elapsedTime);
      if (remainingSeconds > 0) {
        factors.push({
          label: 'Current session expected remaining',
          minutes: Math.ceil(remainingSeconds / 60)
        });
      }
    }

    // Triage priority additions
    const eCount = this.state.waiting.filter(p => p.priority === 'emergency').length;
    const uCount = this.state.waiting.filter(p => p.priority === 'urgent').length;
    const nCount = this.state.waiting.filter(p => p.priority === 'normal').length;

    if (eCount > 0) {
      factors.push({
        label: `Triage prioritization (${eCount} Immediate Attention cases)`,
        minutes: Math.round((eCount * avgSeconds) / 60)
      });
    }
    if (uCount > 0) {
      factors.push({
        label: `Triage prioritization (${uCount} Priority Care cases)`,
        minutes: Math.round((uCount * avgSeconds) / 60)
      });
    }
    if (nCount > 0) {
      factors.push({
        label: `Standard patient queuing (${nCount} Standard Priority cases)`,
        minutes: Math.round((nCount * avgSeconds) / 60)
      });
    }

    this.state.waitFactors = factors;

    // 4. Smart Queue Insights
    const insights: string[] = [];
    if (this.state.isDelayed) {
      insights.push('Doctor is delayed. Expect temporary waiting time shifts.');
    }
    if (this.state.stats.currentLoad === 'high') {
      insights.push('Peak operational load. Flow is slower due to queue volume.');
    } else if (this.state.stats.currentLoad === 'low') {
      insights.push('Queue operational load is low. Patient flow is optimal.');
    }
    if (eCount > 0) {
      insights.push('Immediate Attention cases active. Triage sorting rules are active.');
    }
    if (!this.state.isDelayed && this.state.stats.currentLoad !== 'high') {
      insights.push('Clinic operating at optimal efficiency. Sessions matching target times.');
    }

    this.state.insights = insights;
  }

  private recalculateState(): void {
    this.recalculateETAs();
    this.recalculateStats();
    this.recalculateMetadataAndInsights();
  }
}
