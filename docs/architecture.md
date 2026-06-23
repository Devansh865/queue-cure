# PulseQueue - System Architecture

PulseQueue is designed as a real-time, responsive, and robust healthcare queue management solution. This document describes the internal engineering decisions, prediction formulas, and concurrency controls that ensure the system operates reliably under clinical stress.

---

## 1. Smart ETA Engine

A key feature of PulseQueue is predicting accurate wait times for patients in line. Unlike simple static estimates, the ETA engine dynamically adjusts based on queue structure, doctor progress, and runtime delays.

### ETA Formula
For the $i$-th patient in the waiting list (where $i = 0$ is the patient next in line):

$$\text{ETA}_i = (i \times T_{\text{avg}}) + T_{\text{active\_remaining}} + D_{\text{offset}}$$

Where:
- $i$: Zero-based position in the queue.
- $T_{\text{avg}}$: Configured average consultation time (e.g. 5 minutes).
- $T_{\text{active\_remaining}}$: Estimated time remaining for the active patient currently in consultation.
  - If there is an active patient: $T_{\text{active\_remaining}} = \max(0, T_{\text{avg}} - T_{\text{active\_elapsed}})$.
  - If there is no active patient (consultation room idle): $T_{\text{active\_remaining}} = 0$.
- $D_{\text{offset}}$: The dynamic delay offset computed when a consultation exceeds the expected duration limit.

### Priority Handling
clinical queues are prioritized rather than strictly FIFO:
- **Emergency**: Instant placement at the top of the waiting queue.
- **Urgent**: Placed below emergencies but ahead of normal patients.
- **Normal**: Placed at the bottom of the queue.

Within each priority band, patients are sorted by checked-in time (FIFO). Because patients are sorted clinical-first, the index $i$ is smaller for higher-priority patients. The Smart ETA engine naturally yields lower wait times for emergencies and shifts normal patient ETAs out accordingly.

---

## 2. Delay Mitigation Protocol

If a consultation exceeds the configured average consultation duration ($T_{\text{active\_elapsed}} > T_{\text{avg}}$), the system invokes the delay mitigation protocol:

1. **Detection**:
   - Every second, the server checks the active patient's elapsed time.
   - If the active patient exceeds the threshold ($T_{\text{avg}}$), the server flags the state as `isDelayed = true` and updates `delaySeconds` with the difference ($T_{\text{active\_elapsed}} - T_{\text{avg}}$).
2. **Propagation**:
   - The delay is immediately added as $D_{\text{offset}}$ to the ETA calculations of all waiting patients.
   - The server broadcasts the updated state to all screens.
3. **UI Warning Badge**:
   - The receptionist dashboard flashes an warning alert: `Consultation Delayed: +X mins`.
   - The patient monitor turns the room status indicator to `Doctor Delay Detected` to manage patient expectations.
4. **Auto-Correction**:
   - Once the delayed patient is completed or skipped, the delay flags are reset, and the queue calculations normalize.

---

## 3. Concurrency Guard & Race Conditions

In high-stress clinic environments, receptionists might double-click buttons, or multiple staff members might use the system simultaneously. PulseQueue implements safeguards at both the frontend and backend:

### Backend Locks
The `QueueManager` uses an atomic action lock to serialize state changes:
- When a state-changing event occurs (e.g. `callNext`, `skipPatient`, or `recallPatient`), the server checks an internal `actionLock` boolean.
- If the lock is active, the call is discarded with a log warning.
- If available, the lock is acquired, the action is executed, and a timer releases the lock after **400 milliseconds**.
- In testing environments (`process.env.NODE_ENV === 'test'`), the lock is bypassed automatically to enable synchronous unit testing.

### State Transitions Validation
The system validates state transitions to prevent illogical events:
- A receptionist can only skip a patient if `state.active` is non-null.
- A patient can only be recalled if they exist in the `missed` list.
- If a patient is recalled, they are automatically placed at the front of the waiting list for prompt attention.

---

## 4. State Serialization & Persistence

To survive server crashes or restarts, the queue state is serialized to a JSON file (`queue-state.json`) inside the backend directory on every modification:
- When the server boots, it tries to read `queue-state.json`.
- If the file exists, it reconstructs the active patient, waiting list, missed queue, served queue history, and token counters.
- If the file is missing or corrupted, it starts with a clean slate.
