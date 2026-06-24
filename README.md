# PulseQueue 🏥

### Real-Time Multi-Cabin Queue Management System for Modern Clinics

🔗 **Live Demo:** https://pulse-queue.vercel.app/

📂 **GitHub Repository:** https://github.com/Devansh865/Queue-cure

---

## The Problem

Many clinics still rely on paper tokens, verbal announcements, and manual queue tracking.

This creates several issues:

* Patients have no visibility into their waiting time.
* Receptionists manually manage queues and patient flow.
* Doctors have no centralized view of clinic operations.
* Delays and emergency cases create confusion for everyone.

---

## Our Solution

PulseQueue is a real-time clinic queue management platform that helps clinics manage patient flow efficiently.

The system synchronizes receptionists, doctors, and patient display boards instantly using Socket.IO, while dynamically calculating waiting times and handling real-world scenarios such as emergency patients, delayed consultations, missed calls, and multi-doctor clinics.

---

### Landing Page

<img width="1912" height="866" alt="Screenshot 2026-06-24 174729" src="https://github.com/user-attachments/assets/8338eb17-8852-4c14-aae4-d679c4848cf2" />


### Receptionist Command Center

<img width="1916" height="877" alt="Screenshot 2026-06-24 174739" src="https://github.com/user-attachments/assets/caaf1816-aa34-4a78-8aaa-162c34b715d1" />
<img width="1916" height="867" alt="Screenshot 2026-06-24 174751" src="https://github.com/user-attachments/assets/da04a66a-85bb-42d2-bd39-d93bfbc5e7ec" />


### Patient Veiw Board

<img width="1913" height="876" alt="Screenshot 2026-06-24 174806" src="https://github.com/user-attachments/assets/7cbdaa44-cb40-45f3-808c-f123c22e5e99" />

## Mobile Queue Tracking

Patients can scan the QR code displayed on the lobby monitor and track queue updates from their phones without waiting near the consultation room.

<img width="738" height="1600" alt="WhatsApp Image 2026-06-24 at 6 25 53 PM" src="https://github.com/user-attachments/assets/9a166466-7b3c-492d-baee-9b117b7a5c50" />

---

## Key Features

### Real-Time Synchronization

* Instant updates across all connected screens.
* No page refresh required.
* Built using Socket.IO.

### Multi-Cabin Support

* Independent queues for multiple doctors.
* Cabin-specific ETAs.
* Separate consultation workflows.

### Smart ETA Prediction

The system continuously recalculates waiting times based on:

* Queue length
* Consultation duration
* Doctor delays
* Patient priority

### Priority-Based Triage

Patients are automatically prioritized:

Emergency → Urgent → Normal

FIFO ordering is preserved within each priority group.

### Voice Announcements

When a patient is called:

* Audio chime is played
* Token is announced using Text-to-Speech
* Cabin information is included

Example:

"Token QC-014, please proceed to Cabin 03."

### QR-Based Patient Tracking

Patients can scan a QR code and:

* Track their queue position
* View estimated waiting time
* Monitor updates remotely

### Doctor Delay Management

Receptionists can apply delay adjustments.

The system automatically:

* Updates ETAs
* Updates patient displays
* Updates waiting indicators

### Missed Patient Recovery

Patients who miss their turn can be:

* Skipped
* Moved to the recovery queue
* Recalled later

---

## Edge Cases Handled

PulseQueue was designed to handle real-world clinic scenarios:

* Emergency patient insertion
* Double-click protection
* Simultaneous cabin operations
* Delayed consultations
* Missed patient recalls
* Voice announcement queueing
* Browser refresh recovery
* Large waiting queues
* Empty cabin handling
* Queue state persistence

---

## System Architecture

<img width="891" height="613" alt="image" src="https://github.com/user-attachments/assets/9b8c13f3-21f5-4c29-a6b9-cd54f0a3ed07" />


### High-Level Flow

Reception Dashboard
↓
Express + Socket.IO Backend
↓
Cabin Registry
↓
Individual Queue Managers
↓
Patient Display Board & QR Tracking

---

## Technology Stack

### Frontend

* Next.js 15
* TypeScript
* Tailwind CSS
* Framer Motion
* Socket.IO Client

### Backend

* Node.js
* Express.js
* Socket.IO
* TypeScript

### Testing

* Jest

### Persistence

* JSON-based Queue State Storage

---

## Project Structure

```text
queue-cure-2026/
├── backend/
├── frontend/
├── docs/
├── package.json
└── README.md
```

---

## Running Locally

### Install Dependencies

```bash
npm install
```

### Start Backend

```bash
npm run dev:backend
```

### Start Frontend

```bash
npm run dev:frontend
```

Backend:
http://localhost:3001

Frontend:
http://localhost:3000

---

## Testing

Run backend tests:

```bash
npm run test:backend
```

Tests cover:

* Priority sorting
* ETA calculations
* Delay handling
* Queue operations
* Concurrency protection

---

## Future Enhancements

* SMS / WhatsApp notifications
* Appointment scheduling
* Authentication & role management
* Database persistence
* Analytics dashboard
* Mobile application

---

## Built For QueueCure '26

PulseQueue demonstrates how modern clinics can reduce waiting-room confusion, improve patient transparency, and manage multiple doctors through a single real-time platform.

