import fs from 'fs';
import path from 'path';
import { Patient, QueueState, QueueStats, Priority } from './types';

export class QueueManager {
  private state: QueueState;
  private actionLock: boolean = false;
  private lockTimeout: NodeJS.Timeout | null = null;

  // Per-cabin identity
  private readonly cabinId: string;
  private readonly cabinLabel: string;
  private readonly defaultDoctorName: string;
  private readonly getNextToken: () => string; // Supplied by CabinRegistry (global counter)
  private readonly stateFilePath: string;

  constructor(
    cabinId: string,
    cabinLabel: string,
    defaultDoctorName: string,
    getNextToken: () => string
  ) {
    this.cabinId = cabinId;
    this.cabinLabel = cabinLabel;
    this.defaultDoctorName = defaultDoctorName;
    this.getNextToken = getNextToken;
    this.stateFilePath = path.join(__dirname, `../queue-state-${cabinId}.json`);

    this.state = this.getInitialState();
    this.loadState();
  }

  private getInitialState(): QueueState {
    return {
      cabinId: this.cabinId,
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
      manualDelaySeconds: 0,
      confidence: 'high',
      waitFactors: [],
      roomInfo: {
        roomNumber: this.cabinLabel,
        doctorName: this.defaultDoctorName,
        status: 'available',
        expectedCompletionTime: 300
      },
      insights: ['Queue load is low. Patient flow is optimal.'],
      notifications: [
        {
          id: `notif_${Date.now()}`,
          message: `${this.cabinLabel} initialized. Clinical operations ready.`,
          timestamp: Date.now(),
          type: 'info'
        }
      ]
    };
  }

  // Persists the queue state to a cabin-scoped JSON file
  private saveState(): void {
    try {
      const data = JSON.stringify({ state: this.state }, null, 2);
      fs.writeFileSync(this.stateFilePath, data, 'utf8');
    } catch (error) {
      console.error(`[${this.cabinId}] Failed to save state to disk:`, error);
    }
  }

  // Loads the queue state from the cabin-scoped JSON file if it exists
  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const fileContent = fs.readFileSync(this.stateFilePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && parsed.state) {
          // Merge with initial state to populate newly added schema fields gracefully
          this.state = {
            ...this.getInitialState(),
            ...parsed.state,
            cabinId: this.cabinId // Always enforce correct cabinId
          };
          console.log(`[${this.cabinId}] State loaded successfully.`);
        }
      }
    } catch (error: any) {
      console.warn(`[${this.cabinId}] Failed to load state from disk, starting fresh:`, error.message);
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
    this.state.notifications = [newNotif, ...this.state.notifications].slice(0, 10);
  }

  // Core concurrency locking mechanism
  private acquireLock(): boolean {
    if (process.env.NODE_ENV === 'test') return true;
    if (this.actionLock) return false;
    this.actionLock = true;
    this.lockTimeout = setTimeout(() => {
      this.actionLock = false;
    }, 400);
    return true;
  }

  public getState(): QueueState {
    return this.state;
  }

  public addPatient(name: string, symptoms: string, priority: Priority): Patient | null {
    if (!name.trim()) return null;

    let displayName = name.trim();
    const countDuplicates = this.state.waiting.filter(
      p => p.name.toLowerCase().startsWith(displayName.toLowerCase())
    ).length + (this.state.active?.name.toLowerCase().startsWith(displayName.toLowerCase()) ? 1 : 0);

    if (countDuplicates > 0) {
      displayName = `${displayName} (${countDuplicates + 1})`;
    }

    // Use global token counter supplied by CabinRegistry
    const token = this.getNextToken();

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
    this.sortWaitingQueue();

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
    const priorityWeights = { emergency: 3, urgent: 2, normal: 1 };
    this.state.waiting.sort((a, b) => {
      const weightA = priorityWeights[a.priority];
      const weightB = priorityWeights[b.priority];
      if (weightA !== weightB) return weightB - weightA;
      return a.joinedAt - b.joinedAt;
    });
  }

  public callNext(): { active: Patient | null; served: Patient | null } | null {
    if (!this.acquireLock()) {
      console.warn(`[${this.cabinId}] Call next blocked due to active concurrency lock`);
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
      this.addNotification(`Patient Called: ${nextPatient.token} (${nextPatient.name}) to ${this.state.roomInfo.roomNumber}.`, 'info');
    }

    this.state.isDelayed = false;
    this.state.delaySeconds = 0;
    this.state.manualDelaySeconds = 0; // doctor has resumed — absorb the manual offset

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
    patient.joinedAt = Date.now();
    patient.skippedAt = null;
    patient.calledAt = null;
    patient.servedAt = null;
    patient.elapsedTime = 0;

    this.state.waiting.unshift(patient);
    this.addNotification(`Recall Alert: Patient ${patient.name} (${patient.token}) recalled to active queue.`, 'info');

    this.recalculateState();
    this.saveState();
    return patient;
  }

  public addManualDelay(minutes: number): void {
    if (minutes <= 0) return;
    this.state.manualDelaySeconds = Math.max(0, this.state.manualDelaySeconds + minutes * 60);
    const totalManualMin = Math.round(this.state.manualDelaySeconds / 60);
    this.addNotification(
      `Manual Delay: Dr. ${this.state.roomInfo.doctorName} delayed by +${minutes} min. Total offset: ${totalManualMin} min. ETAs recalculated.`,
      'delay'
    );
    this.recalculateState();
    this.saveState();
  }

  public resetManualDelay(): void {
    this.state.manualDelaySeconds = 0;
    this.addNotification(`Delay cleared for Dr. ${this.state.roomInfo.doctorName}. ETAs normalised.`, 'info');
    this.recalculateState();
    this.saveState();
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
    this.addNotification(`Room Config: ${roomNumber} assigned to Dr. ${doctorName}.`, 'info');
    this.recalculateState();
    this.saveState();
  }

  public resetQueue(): void {
    if (this.lockTimeout) clearTimeout(this.lockTimeout);
    this.actionLock = false;
    this.state = this.getInitialState();
    this.addNotification(`${this.cabinLabel} queue reset.`, 'warning');
    this.saveState();
  }

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

      this.recalculateETAs();
      this.recalculateStats();
      this.recalculateMetadataAndInsights();
    }
    return stateChanged;
  }

  private recalculateETAs(): void {
    const avgSeconds = this.state.averageConsultationTime * 60;

    let currentPatientRemainingSeconds = avgSeconds;
    if (this.state.active) {
      currentPatientRemainingSeconds = Math.max(0, avgSeconds - this.state.active.elapsedTime);
    } else {
      currentPatientRemainingSeconds = 0;
    }

    const delayOffset = (this.state.isDelayed ? this.state.delaySeconds : 0) + this.state.manualDelaySeconds;

    this.state.waiting.forEach((patient, index) => {
      const waitTime = (index * avgSeconds) + currentPatientRemainingSeconds + delayOffset;
      patient.estimatedWaitTime = waitTime;
    });
  }

  private recalculateStats(): void {
    const waiting = this.state.waiting.length;
    const served = this.state.served.length;
    const missed = this.state.missed.length;

    let avgWaitTime = 0;
    if (served > 0) {
      const totalWait = this.state.served.reduce((sum, p) => {
        const wait = (p.calledAt || 0) - p.joinedAt;
        return sum + Math.max(0, wait);
      }, 0);
      avgWaitTime = Math.floor((totalWait / served) / 1000);
    }

    let currentLoad: 'low' | 'medium' | 'high' = 'low';
    if (waiting >= 6) currentLoad = 'high';
    else if (waiting >= 3) currentLoad = 'medium';

    let efficiency = 100;
    const totalRegistered = served + missed + waiting;
    if (totalRegistered > 0) {
      const missedRatio = missed / totalRegistered;
      efficiency -= missedRatio * 40;
    }
    if (this.state.isDelayed) {
      const delayMinutes = this.state.delaySeconds / 60;
      efficiency -= Math.min(30, delayMinutes * 5);
    }
    const efficiencyScore = Math.max(10, Math.min(100, Math.floor(efficiency)));

    let queueHealth: 'optimal' | 'warning' | 'critical' = 'optimal';
    if (efficiencyScore < 50 || (this.state.isDelayed && this.state.delaySeconds > 300) || currentLoad === 'high') {
      queueHealth = 'critical';
    } else if (efficiencyScore < 75 || this.state.isDelayed || currentLoad === 'medium') {
      queueHealth = 'warning';
    }

    this.state.stats = { totalWaiting: waiting, totalServed: served, totalMissed: missed, averageWaitTime: avgWaitTime, currentLoad, efficiencyScore, queueHealth };
  }

  private recalculateMetadataAndInsights(): void {
    if (this.state.active) {
      this.state.roomInfo.status = this.state.isDelayed ? 'delayed' : 'busy';
    } else {
      this.state.roomInfo.status = 'available';
    }
    this.state.roomInfo.expectedCompletionTime = this.state.averageConsultationTime * 60;

    const waiting = this.state.waiting.length;
    const isDelayed = this.state.isDelayed;
    const delaySeconds = this.state.delaySeconds;
    const emergencyCount = this.state.waiting.filter(p => p.priority === 'emergency').length;

    if (isDelayed && delaySeconds >= 180) this.state.confidence = 'low';
    else if ((isDelayed && delaySeconds > 0) || waiting > 5 || emergencyCount > 1) this.state.confidence = 'medium';
    else this.state.confidence = 'high';

    const avgSeconds = this.state.averageConsultationTime * 60;
    const factors: { label: string, minutes: number }[] = [];

    if (isDelayed && delaySeconds > 0) {
      factors.push({ label: 'Current session overrun delay', minutes: Math.ceil(delaySeconds / 60) });
    } else if (this.state.active) {
      const remainingSeconds = Math.max(0, avgSeconds - this.state.active.elapsedTime);
      if (remainingSeconds > 0) {
        factors.push({ label: 'Current session expected remaining', minutes: Math.ceil(remainingSeconds / 60) });
      }
    }

    const eCount = this.state.waiting.filter(p => p.priority === 'emergency').length;
    const uCount = this.state.waiting.filter(p => p.priority === 'urgent').length;
    const nCount = this.state.waiting.filter(p => p.priority === 'normal').length;

    if (eCount > 0) factors.push({ label: `Triage prioritization (${eCount} Immediate Attention cases)`, minutes: Math.round((eCount * avgSeconds) / 60) });
    if (uCount > 0) factors.push({ label: `Triage prioritization (${uCount} Priority Care cases)`, minutes: Math.round((uCount * avgSeconds) / 60) });
    if (nCount > 0) factors.push({ label: `Standard patient queuing (${nCount} Standard Priority cases)`, minutes: Math.round((nCount * avgSeconds) / 60) });

    this.state.waitFactors = factors;

    const insights: string[] = [];
    if (this.state.isDelayed) insights.push('Doctor is delayed. Expect temporary waiting time shifts.');
    if (this.state.stats.currentLoad === 'high') insights.push('Peak operational load. Flow is slower due to queue volume.');
    else if (this.state.stats.currentLoad === 'low') insights.push('Queue operational load is low. Patient flow is optimal.');
    if (eCount > 0) insights.push('Immediate Attention cases active. Triage sorting rules are active.');
    if (!this.state.isDelayed && this.state.stats.currentLoad !== 'high') insights.push('Clinic operating at optimal efficiency. Sessions matching target times.');
    this.state.insights = insights;
  }

  private recalculateState(): void {
    this.recalculateETAs();
    this.recalculateStats();
    this.recalculateMetadataAndInsights();
  }
}
