'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Re-use types from backend to ensure alignment
export type Priority = 'normal' | 'urgent' | 'emergency';
export type PatientStatus = 'waiting' | 'serving' | 'served' | 'skipped';

export interface Patient {
  id: string;
  token: string;
  name: string;
  symptoms: string;
  priority: Priority;
  status: PatientStatus;
  joinedAt: number;
  calledAt: number | null;
  servedAt: number | null;
  skippedAt: number | null;
  estimatedWaitTime: number; // seconds
  elapsedTime: number; // seconds
}

export interface QueueStats {
  totalWaiting: number;
  totalServed: number;
  totalMissed: number;
  averageWaitTime: number;
  currentLoad: 'low' | 'medium' | 'high';
  efficiencyScore: number;
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
  averageConsultationTime: number;
  stats: QueueStats;
  isDelayed: boolean;
  delaySeconds: number;
  confidence: 'high' | 'medium' | 'low';
  waitFactors: WaitChangeFactor[];
  roomInfo: RoomInfo;
  insights: string[];
  notifications: NotificationLog[];
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export function useSocket(onPatientCalled?: (payload: { token: string; name: string }) => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const onPatientCalledRef = useRef(onPatientCalled);

  // Keep callback reference updated
  useEffect(() => {
    onPatientCalledRef.current = onPatientCalled;
  }, [onPatientCalled]);

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      console.log('Connected to QueueCure Backend');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from QueueCure Backend');
      setIsConnected(false);
    });

    socketInstance.on('state-update', (state: QueueState) => {
      setQueueState(state);
    });

    socketInstance.on('patient-call-alert', (payload: { token: string; name: string }) => {
      if (onPatientCalledRef.current) {
        onPatientCalledRef.current(payload);
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const addPatient = useCallback((name: string, symptoms: string, priority: Priority) => {
    if (socket && isConnected) {
      socket.emit('add-patient', { name, symptoms, priority });
    }
  }, [socket, isConnected]);

  const callNext = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('call-next');
    }
  }, [socket, isConnected]);

  const skipPatient = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('skip-patient');
    }
  }, [socket, isConnected]);

  const recallPatient = useCallback((patientId: string) => {
    if (socket && isConnected) {
      socket.emit('recall-patient', { patientId });
    }
  }, [socket, isConnected]);

  const updateConfig = useCallback((averageConsultationTime: number) => {
    if (socket && isConnected) {
      socket.emit('update-config', { averageConsultationTime });
    }
  }, [socket, isConnected]);

  const updateRoomInfo = useCallback((roomNumber: string, doctorName: string) => {
    if (socket && isConnected) {
      socket.emit('update-room-info', { roomNumber, doctorName });
    }
  }, [socket, isConnected]);

  const resetQueue = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('reset-queue');
    }
  }, [socket, isConnected]);

  return {
    isConnected,
    queueState,
    addPatient,
    callNext,
    skipPatient,
    recallPatient,
    updateConfig,
    updateRoomInfo,
    resetQueue
  };
}
