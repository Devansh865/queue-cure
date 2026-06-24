import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { CabinRegistry } from './cabinRegistry';
import { Priority } from './types';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: Date.now() });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const registry = new CabinRegistry();

// ─── REST Endpoints ───────────────────────────────────────────────────────────

// Returns metadata for all registered cabins (for cabin switcher UI)
app.get('/cabins', (req, res) => {
  res.json({ cabins: registry.getCabinConfigs() });
});

// ─── Broadcast Helpers ────────────────────────────────────────────────────────

/** Emit updated state for one cabin + refresh the lobby overview */
function broadcastCabin(cabinId: string): void {
  const cabin = registry.getCabin(cabinId);
  if (!cabin) return;
  io.emit('state-update', { cabinId, state: cabin.getState() });
  io.emit('all-cabins-update', registry.getMultiCabinState());
}

/** Emit only the lobby overview (used by the 1-second tick) */
function broadcastAll(): void {
  // Emit per-cabin updates so individual monitors stay current
  for (const cabinId of registry.getCabinIds()) {
    const cabin = registry.getCabin(cabinId)!;
    io.emit('state-update', { cabinId, state: cabin.getState() });
  }
  io.emit('all-cabins-update', registry.getMultiCabinState());
}

// ─── 1-Second Tick ────────────────────────────────────────────────────────────
setInterval(() => {
  registry.tickAll();
  broadcastAll();
}, 1000);

// ─── Socket Events ────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send full state snapshot on connect so any page can start immediately
  for (const cabinId of registry.getCabinIds()) {
    const cabin = registry.getCabin(cabinId)!;
    socket.emit('state-update', { cabinId, state: cabin.getState() });
  }
  socket.emit('all-cabins-update', registry.getMultiCabinState());

  // ── Per-cabin state refresh (e.g. when dashboard switches tabs)
  socket.on('get-cabin-state', (data: { cabinId: string }) => {
    const cabin = registry.getCabin(data?.cabinId);
    if (cabin) {
      socket.emit('state-update', { cabinId: data.cabinId, state: cabin.getState() });
    }
  });

  // ── Deprecated single-cabin get-state — kept for backward compat
  socket.on('get-state', () => {
    socket.emit('all-cabins-update', registry.getMultiCabinState());
  });

  // ── Register new patient to a specific cabin
  socket.on('add-patient', (data: { cabinId: string; name: string; symptoms: string; priority: Priority }) => {
    console.log('Event: add-patient', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin) return;
    const patient = cabin.addPatient(data.name, data.symptoms, data.priority);
    if (patient) broadcastCabin(data.cabinId);
  });

  // ── Call the next patient in a cabin
  socket.on('call-next', (data: { cabinId: string }) => {
    console.log('Event: call-next', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin) return;
    const result = cabin.callNext();
    if (result) {
      broadcastCabin(data.cabinId);
      if (result.active) {
        const state = cabin.getState();
        // Payload includes cabin info for voice announcement
        io.emit('patient-call-alert', {
          token: result.active.token,
          name: result.active.name,
          cabinId: data.cabinId,
          cabinLabel: state.roomInfo.roomNumber,
          doctorName: state.roomInfo.doctorName,
        });
      }
    }
  });

  // ── Skip the active patient in a cabin
  socket.on('skip-patient', (data: { cabinId: string }) => {
    console.log('Event: skip-patient', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin) return;
    const skipped = cabin.skipPatient();
    if (skipped) broadcastCabin(data.cabinId);
  });

  // ── Recall a missed patient to the front of a cabin's queue
  socket.on('recall-patient', (data: { cabinId: string; patientId: string }) => {
    console.log('Event: recall-patient', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin || !data?.patientId) return;
    const recalled = cabin.recallPatient(data.patientId);
    if (recalled) broadcastCabin(data.cabinId);
  });

  // ── Update average consultation time for a cabin
  socket.on('update-config', (data: { cabinId: string; averageConsultationTime: number }) => {
    console.log('Event: update-config', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin || typeof data?.averageConsultationTime !== 'number') return;
    cabin.updateConfig(data.averageConsultationTime);
    broadcastCabin(data.cabinId);
  });

  // ── Update doctor / room info for a cabin
  socket.on('update-room-info', (data: { cabinId: string; roomNumber: string; doctorName: string }) => {
    console.log('Event: update-room-info', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin || !data?.roomNumber || !data?.doctorName) return;
    cabin.updateRoomInfo(data.roomNumber, data.doctorName);
    broadcastCabin(data.cabinId);
  });

  // ── Reset a specific cabin's queue
  socket.on('reset-queue', (data: { cabinId: string }) => {
    console.log('Event: reset-queue', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin) return;
    cabin.resetQueue();
    broadcastCabin(data.cabinId);
    io.emit('queue-reset', { cabinId: data.cabinId });
  });

  // ── Add manual doctor delay (receptionist reports that a doctor is running late)
  socket.on('add-delay', (data: { cabinId: string; delayMinutes: number }) => {
    console.log('Event: add-delay', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin || typeof data?.delayMinutes !== 'number') return;
    cabin.addManualDelay(data.delayMinutes);
    broadcastCabin(data.cabinId);
  });

  // ── Clear all manual delays for a cabin
  socket.on('clear-delay', (data: { cabinId: string }) => {
    console.log('Event: clear-delay', data);
    const cabin = registry.getCabin(data?.cabinId);
    if (!cabin) return;
    cabin.resetManualDelay();
    broadcastCabin(data.cabinId);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`PulseQueue Multi-Cabin Backend running on http://localhost:${PORT}`);
});
