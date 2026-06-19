import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { QueueManager } from './queueManager';
import { Priority } from './types';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({
  origin: '*', // Allow all origins for testing/development simplicity
  methods: ['GET', 'POST']
}));
app.use(express.json());

// Simple HTTP health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: Date.now() });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const queueManager = new QueueManager();

// Periodically tick every 1 second to update active consultation elapsed time and recalculate delay states.
setInterval(() => {
  // Always tick the active patient
  const stateChanged = queueManager.tickActivePatient(1);
  
  // Broadcast state updates to keep all dashboard timers and ETAs perfectly synchronized in real-time
  io.emit('state-update', queueManager.getState());
}, 1000);

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial state upon connection
  socket.emit('state-update', queueManager.getState());

  socket.on('get-state', () => {
    socket.emit('state-update', queueManager.getState());
  });

  socket.on('add-patient', (data: { name: string; symptoms: string; priority: Priority }) => {
    console.log('Event: add-patient received', data);
    const newPatient = queueManager.addPatient(data.name, data.symptoms, data.priority);
    if (newPatient) {
      io.emit('state-update', queueManager.getState());
    }
  });

  socket.on('call-next', () => {
    console.log('Event: call-next received');
    const result = queueManager.callNext();
    if (result) {
      io.emit('state-update', queueManager.getState());
      if (result.active) {
        // Emit voice call alert for patient display to announce
        io.emit('patient-call-alert', {
          token: result.active.token,
          name: result.active.name
        });
      }
    }
  });

  socket.on('skip-patient', () => {
    console.log('Event: skip-patient received');
    const skipped = queueManager.skipPatient();
    if (skipped) {
      io.emit('state-update', queueManager.getState());
    }
  });

  socket.on('recall-patient', (data: { patientId: string }) => {
    console.log('Event: recall-patient received', data);
    if (data && data.patientId) {
      const recalled = queueManager.recallPatient(data.patientId);
      if (recalled) {
        io.emit('state-update', queueManager.getState());
      }
    }
  });

  socket.on('update-config', (data: { averageConsultationTime: number }) => {
    console.log('Event: update-config received', data);
    if (data && typeof data.averageConsultationTime === 'number') {
      queueManager.updateConfig(data.averageConsultationTime);
      io.emit('state-update', queueManager.getState());
    }
  });

  socket.on('update-room-info', (data: { roomNumber: string; doctorName: string }) => {
    console.log('Event: update-room-info received', data);
    if (data && data.roomNumber && data.doctorName) {
      queueManager.updateRoomInfo(data.roomNumber, data.doctorName);
      io.emit('state-update', queueManager.getState());
    }
  });

  socket.on('reset-queue', () => {
    console.log('Event: reset-queue received');
    queueManager.resetQueue();
    io.emit('state-update', queueManager.getState());
    io.emit('queue-reset');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`QueueCure AI Real-time Backend running on http://localhost:${PORT}`);
});
