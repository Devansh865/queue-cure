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
  cabinId: string;
  waiting: Patient[];
  active: Patient | null;
  missed: Patient[];
  served: Patient[];
  averageConsultationTime: number;
  stats: QueueStats;
  isDelayed: boolean;
  delaySeconds: number;
  manualDelaySeconds: number; // Receptionist-injected delay (e.g. "Doctor running 10 min late")
  confidence: 'high' | 'medium' | 'low';
  waitFactors: WaitChangeFactor[];
  roomInfo: RoomInfo;
  insights: string[];
  notifications: NotificationLog[];
}


// Full snapshot of all cabins — used by the lobby monitor and overview screens
export interface MultiCabinState {
  cabins: Record<string, QueueState>; // keyed by cabinId
  globalTokenCounter: number;
}
