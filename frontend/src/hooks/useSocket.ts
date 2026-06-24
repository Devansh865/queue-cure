'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  cabinId: string;
  waiting: Patient[];
  active: Patient | null;
  missed: Patient[];
  served: Patient[];
  averageConsultationTime: number;
  stats: QueueStats;
  isDelayed: boolean;
  delaySeconds: number;
  manualDelaySeconds: number;
  confidence: 'high' | 'medium' | 'low';
  waitFactors: WaitChangeFactor[];
  roomInfo: RoomInfo;
  insights: string[];
  notifications: NotificationLog[];
}

export interface MultiCabinState {
  cabins: Record<string, QueueState>; // keyed by cabinId
  globalTokenCounter: number;
}

// Payload emitted by the server when a patient is called
export interface PatientCallAlert {
  token: string;
  name: string;
  cabinId: string;
  cabinLabel: string;
  doctorName: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// ─── useSocket — per-cabin hook for the dashboard and per-cabin monitor ───────

export function useSocket(
  cabinId: string,
  onPatientCalled?: (payload: PatientCallAlert) => void
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [queueState, setQueueState] = useState<QueueState | null>(null);

  const cabinIdRef = useRef(cabinId);
  const onPatientCalledRef = useRef(onPatientCalled);
  const socketRef = useRef<Socket | null>(null);

  // Keep refs current
  useEffect(() => { cabinIdRef.current = cabinId; }, [cabinId]);
  useEffect(() => { onPatientCalledRef.current = onPatientCalled; }, [onPatientCalled]);

  // Create socket once on mount
  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      console.log(`[useSocket:${cabinIdRef.current}] Connected`);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log(`[useSocket:${cabinIdRef.current}] Disconnected`);
      setIsConnected(false);
    });

    // Filter state updates by cabin
    socketInstance.on('state-update', (payload: { cabinId: string; state: QueueState }) => {
      if (payload.cabinId === cabinIdRef.current) {
        setQueueState(payload.state);
      }
    });

    // Filter patient-call-alert by cabin (only the current cabin's monitor should announce)
    socketInstance.on('patient-call-alert', (payload: PatientCallAlert) => {
      if (payload.cabinId === cabinIdRef.current && onPatientCalledRef.current) {
        onPatientCalledRef.current(payload);
      }
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    return () => { socketInstance.disconnect(); };
  }, []); // single persistent connection

  // When cabinId changes (dashboard tab switch): clear stale state, request new cabin state
  useEffect(() => {
    setQueueState(null);
    if (socketRef.current?.connected) {
      socketRef.current.emit('get-cabin-state', { cabinId });
    }
  }, [cabinId]);

  // ─── Actions (all include cabinId) ─────────────────────────────────────────

  const addPatient = useCallback((name: string, symptoms: string, priority: Priority) => {
    socketRef.current?.emit('add-patient', { cabinId: cabinIdRef.current, name, symptoms, priority });
  }, []);

  const callNext = useCallback(() => {
    socketRef.current?.emit('call-next', { cabinId: cabinIdRef.current });
  }, []);

  const skipPatient = useCallback(() => {
    socketRef.current?.emit('skip-patient', { cabinId: cabinIdRef.current });
  }, []);

  const recallPatient = useCallback((patientId: string) => {
    socketRef.current?.emit('recall-patient', { cabinId: cabinIdRef.current, patientId });
  }, []);

  const addDelay = useCallback((delayMinutes: number) => {
    socketRef.current?.emit('add-delay', { cabinId: cabinIdRef.current, delayMinutes });
  }, []);

  const clearDelay = useCallback(() => {
    socketRef.current?.emit('clear-delay', { cabinId: cabinIdRef.current });
  }, []);

  const updateConfig = useCallback((averageConsultationTime: number) => {
    socketRef.current?.emit('update-config', { cabinId: cabinIdRef.current, averageConsultationTime });
  }, []);

  const updateRoomInfo = useCallback((roomNumber: string, doctorName: string) => {
    socketRef.current?.emit('update-room-info', { cabinId: cabinIdRef.current, roomNumber, doctorName });
  }, []);

  const resetQueue = useCallback(() => {
    socketRef.current?.emit('reset-queue', { cabinId: cabinIdRef.current });
  }, []);

  return {
    isConnected,
    queueState,
    addPatient,
    callNext,
    skipPatient,
    recallPatient,
    addDelay,
    clearDelay,
    updateConfig,
    updateRoomInfo,
    resetQueue,
  };
}

// ─── useCabinOverview — receives all-cabins-update for the lobby monitor ──────

export function useCabinOverview(onPatientCalled?: (payload: PatientCallAlert) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [cabinsState, setCabinsState] = useState<MultiCabinState | null>(null);
  const onPatientCalledRef = useRef(onPatientCalled);

  useEffect(() => { onPatientCalledRef.current = onPatientCalled; }, [onPatientCalled]);

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      console.log('[useCabinOverview] Connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('[useCabinOverview] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('all-cabins-update', (state: MultiCabinState) => {
      setCabinsState(state);
    });

    // Lobby monitor announces for ALL cabins
    socketInstance.on('patient-call-alert', (payload: PatientCallAlert) => {
      if (onPatientCalledRef.current) {
        onPatientCalledRef.current(payload);
      }
    });

    return () => { socketInstance.disconnect(); };
  }, []);

  return { isConnected, cabinsState };
}
