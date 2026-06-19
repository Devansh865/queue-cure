export type Priority = 'normal' | 'urgent' | 'emergency';
export type PatientStatus = 'waiting' | 'serving' | 'served' | 'skipped';

export interface Patient {
  id: string;
  token: string;
  name: string;
  symptoms: string;
  priority: Priority;
  status: PatientStatus;
  joinedAt: number;     // timestamp ms
  calledAt: number | null;
  servedAt: number | null;
  skippedAt: number | null;
  estimatedWaitTime: number; // in seconds
  elapsedTime: number; // in seconds, tracks active consultation duration
}

export interface QueueStats {
  totalWaiting: number;
  totalServed: number;
  totalMissed: number;
  averageWaitTime: number; // in seconds
  currentLoad: 'low' | 'medium' | 'high';
  efficiencyScore: number; // 0-100
  queueHealth: 'optimal' | 'warning' | 'critical';
}

export interface WaitChangeFactor {
  label: string;
  minutes: number;
}

export interface RoomInfo {
  roomNumber: string;
  doctorName: string;
  status: 'available' | 'busy' | 'delayed';
  expectedCompletionTime: number | null;
}

export interface NotificationLog {
  id: string;
  message: string;
  timestamp: number;
  type: 'info' | 'warning' | 'emergency' | 'delay';
}

export interface QueueState {
  waiting: Patient[];
  active: Patient | null;
  missed: Patient[];
  served: Patient[];
  averageConsultationTime: number; // in minutes (default 5)
  stats: QueueStats;
  isDelayed: boolean;
  delaySeconds: number;
  // NEW PATIENT-CENTRIC SCHEMA
  confidence: 'high' | 'medium' | 'low';
  waitFactors: WaitChangeFactor[];
  roomInfo: RoomInfo;
  insights: string[];
  notifications: NotificationLog[];
}
