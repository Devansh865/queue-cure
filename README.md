# QueueCure AI 🏥📈

QueueCure AI is a production-grade, real-time clinical command center and patient queue management system designed for modern clinics and hospitals. It synchronizes medical receptionists and patient waiting boards instantaneously via Socket.IO, offering auto-calculated smart ETAs, delay predictions, priority triage scheduling, and text-to-speech audio callouts.

---

## 🚀 Key Features

* **Real-time Synchronized Boards**: Updates are broadcasted to all connected clients in under 50ms upon any receptionist queue action.
* **Triage Priority Scheduling**: Patients are sorted clinically: `Emergency` $\rightarrow$ `Urgent` $\rightarrow$ `Normal`, utilizing strict FIFO sorting within priority groups.
* **Smart ETA Estimation Engine**: Continuously updates waiting times based on queue size, elapsed session time, and clinical priority rankings.
* **Dynamic Delay Detection**: Exceeding average consultation times alerts receptionists and adjusts patient wait times on waiting screens.
* **Skipped/Missed Queue Recalls**: Skips inactive patients and places them in a recovery panel where they can be recalled back to the front of the queue.
* **Text-to-Speech & Chime Announcements**: Procedural Audio Web chime and TTS engine speaks called tokens out loud in real-time.
* **Futuristic Dark-Mode UI**: Built with glassmorphism, responsive tables, animated timelines, and glowing indicator alerts.
* **Persisted Queue State**: Automatically serializes operational states to disk on updates, allowing recovery from crash scenarios.
* **Race Condition Mitigation**: Implements 400ms backend locks and frontend button debouncing.

---

## 📂 Repository Directory Structure

```
queue-cure-2026/
├── backend/
│   ├── src/
│   │   ├── __tests__/
│   │   │   └── queueManager.test.ts  # Backend unit tests
│   │   ├── queueManager.ts           # Class-based state & ETA scheduler
│   │   ├── server.ts                 # Socket.IO & Express configuration
│   │   └── types.ts                  # Shared TypeScript interfaces
│   ├── jest.config.js
│   ├── package.json                  # Node backend configuration
│   └── tsconfig.json                 # TypeScript compiler setup
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Receptionist Command Center
│   │   │   ├── monitor/
│   │   │   │   └── page.tsx          # Patient Screen & Speech Engine
│   │   │   ├── globals.css           # Premium glassmorphic styles
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx              # Portal landing page
│   │   ├── components/
│   │   │   ├── StatsCard.tsx         # Analytical KPI statistics card
│   │   │   ├── VisualTimeline.tsx    # Animated progress timeline component
│   │   │   └── PatientSearch.tsx     # Personalized ETA lookup utility
│   │   ├── hooks/
│   │   │   └── useSocket.ts          # Unified WebSockets hook
│   │   └── lib/
│   │       └── utils.ts
│   ├── package.json                  # Next.js 15 app configurations
│   ├── tailwind.config.ts            # Styling setup
│   └── tsconfig.json
├── docs/
│   ├── architecture.md               # Smart ETA & concurrency details
│   └── flow-diagram.md               # Event sequence flowcharts
├── package.json                      # Workspace configuration
└── README.md                         # Project documentation
```

---

## 🛠️ Quick Start

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### 1. Installation
Run npm install in the workspace root. This will automatically resolve dependencies for the backend, frontend, and root:
```bash
npm install
```

### 2. Running the System Locally

To spin up both services concurrently in development mode, run:
- In terminal 1 (Start the WebSocket Backend):
  ```bash
  npm run dev:backend
  ```
  The server will spin up on [http://localhost:3001](http://localhost:3001).

- In terminal 2 (Start the Next.js Frontend):
  ```bash
  npm run dev:frontend
  ```
  The app will launch on [http://localhost:3000](http://localhost:3000).

---

## 🧪 Testing Backend Operations
Our backend contains comprehensive test coverage checking queue sorting, dynamic ETAs, delay triggers, and double-click actions:
```bash
npm run test:backend
```

---

## 🎛️ Websocket Event Protocols

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `add-patient` | Client $\rightarrow$ Server | `{ name, symptoms, priority }` | Registers a new patient |
| `call-next` | Client $\rightarrow$ Server | - | Ends current call, pulls next patient in triage |
| `skip-patient` | Client $\rightarrow$ Server | - | Skips patient, moves them to missed queue |
| `recall-patient`| Client $\rightarrow$ Server | `{ patientId }` | Returns skipped patient to front of waitlist |
| `update-config` | Client $\rightarrow$ Server | `{ averageConsultationTime }` | Broadcasts new consultation average |
| `reset-queue` | Client $\rightarrow$ Server | - | Clears all queue records |
| `state-update` | Server $\rightarrow$ Client | `QueueState` | Broadcasts full operational data |
| `patient-call-alert` | Server $\rightarrow$ Client | `{ token, name }` | Triggers browser chime & Voice announcement |

---

## 🌐 Production Deployment Guide

### Deployment Layout

```
                 +---------------------------------------+
                 |            User Browser               |
                 +----+-----------------------------+----+
                      |                             |
     (WebSockets / http://...)               (http://...)
                      |                             |
                      v                             v
         +------------+------------+   +------------+------------+
         |      Node.js Server     |   |      Next.js Frontend    |
         |       (Port 3001)       |   |       (Port 3000)       |
         | +---------------------+ |   |                         |
         | |  Socket.IO Server   | |   |  Static / SSR Pages:    |
         | |  QueueManager State | |   |  - /dashboard           |
         | |  State Persister    | |   |  - /monitor             |
         | +---------------------+ |   |  - /                    |
         +-------------------------+   +-------------------------+
```

### Option A: PM2 Process Management (Recommended for Single-VM / VPS)
For low-maintenance servers (Ubuntu/AWS EC2):

1. **Build all projects**:
   ```bash
   npm run build:backend
   npm run build:frontend
   ```

2. **Configure PM2 config (`ecosystem.config.js`)**:
   Create `ecosystem.config.js` in the root folder:
   ```javascript
   module.exports = {
     apps: [
       {
         name: 'queue-cure-backend',
         script: './backend/dist/server.js',
         env: {
           PORT: 3001,
           NODE_ENV: 'production'
         }
       },
       {
         name: 'queue-cure-frontend',
         script: 'node_modules/next/dist/bin/next',
         args: 'start frontend -p 3000',
         env: {
           NEXT_PUBLIC_SOCKET_URL: 'http://<your-server-ip>:3001',
           NODE_ENV: 'production'
         }
       }
     ]
   };
   ```

3. **Start utilizing PM2**:
   ```bash
   pm2 start ecosystem.config.js
   ```

---

### Option B: Containerization via Docker
We can deploy the apps in separate containers using standard Dockerfiles:

#### Backend Dockerfile (`backend/Dockerfile`):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "start"]
```

#### Frontend Dockerfile (`frontend/Dockerfile`):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

#### Orchestrate with Docker Compose (`docker-compose.yml`):
```yaml
version: '3.8'
services:
  backend:
    build:
      context: ./backend
    ports:
      - "3001:3001"
    volumes:
      - queue-state:/app
  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
volumes:
  queue-state:
```

Launch with: `docker-compose up --build -d`

---

## 📘 Design and Engineering Notes
For details on formulas, state transitions, locking strategies, and sequence flows, refer to:
* 📑 [Architecture Documentation](docs/architecture.md)
* 📊 [Event Sequence Flowcharts](docs/flow-diagram.md)
