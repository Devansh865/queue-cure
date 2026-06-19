# QueueCure AI - Event Flow Diagram

This document illustrates the real-time event lifecycles and communications between the Receptionist Dashboard, Socket.IO Backend Server, and Patient Waiting Screens.

---

## 1. Patient Registration Flow

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    actor Receptionist
    participant Front as Receptionist Dashboard (Client)
    participant Back as Socket.IO Server
    participant Display as Patient TV Board (Client)

    Patient->>Receptionist: Arrives at Clinic (Complains of Fever)
    Receptionist->>Front: Enters Name ("John Doe", Priority: Normal)
    Front->>Back: emit("add-patient", { name, symptoms, priority })
    Note over Back: QueueManager checks duplicate names,<br/>creates unique token (e.g. QC-004),<br/>sorts queue by clinical priority.
    Back-->>Front: emit("state-update", QueueState)
    Back-->>Display: emit("state-update", QueueState)
    Note over Front: Dashboard lists QC-004
    Note over Display: Patient Board shows QC-004 in upcoming list
```

---

## 2. Calling next Patient Flow (Text-to-Speech Callout)

```mermaid
sequenceDiagram
    autonumber
    actor Receptionist
    participant Front as Receptionist Dashboard (Client)
    participant Back as Socket.IO Server
    participant Display as Patient TV Board (Client)

    Receptionist->>Front: Clicks "Call Next Patient"
    Note over Front: Button disabled for 400ms<br/>to prevent double-clicks
    Front->>Back: emit("call-next")
    Note over Back: QueueManager acquires concurrency lock.<br/>Completes active consultation (marks served).<br/>Pops next waiting patient as active.
    Back-->>Front: emit("state-update", QueueState)
    Back-->>Display: emit("state-update", QueueState)
    Back-->>Display: emit("patient-call-alert", { token, name })
    Note over Display: Triggers confetti particles
    Note over Display: Plays procedural medical chime
    Note over Display: HTML5 TTS Speech synthesis:<br/>"Attention please, Token QC-004..."
```

---

## 3. Skip & Missed Queue Recall Flow

```mermaid
sequenceDiagram
    autonumber
    actor Receptionist
    participant Front as Receptionist Dashboard (Client)
    participant Back as Socket.IO Server
    participant Display as Patient TV Board (Client)

    Note over Receptionist: Called token QC-004, but no patient appears.
    Receptionist->>Front: Clicks "Skip Patient"
    Front->>Back: emit("skip-patient")
    Note over Back: Active patient marked "skipped".<br/>Moved to skipped/missed queue.<br/>Active cabin state reset to Idle.
    Back-->>Front: emit("state-update", QueueState)
    Back-->>Display: emit("state-update", QueueState)
    
    Note over Receptionist: Patient John Doe returns to front desk.
    Receptionist->>Front: Clicks "Recall" for QC-004
    Front->>Back: emit("recall-patient", { patientId })
    Note over Back: Patient removed from missed queue.<br/>Inserted at the FRONT of waiting list.
    Back-->>Front: emit("state-update", QueueState)
    Back-->>Display: emit("state-update", QueueState)
```

---

## 4. Periodic Consultation Checking & Delay Detection

```mermaid
sequenceDiagram
    autonumber
    participant Server as Socket.IO Server (1s Timer)
    participant Front as Receptionist Dashboard (Client)
    participant Display as Patient TV Board (Client)

    loop Every 1 Second
        Server->>Server: tickActivePatient(1s)
        Note over Server: Active patient elapsed time incremented.<br/>Is elapsed > avg duration (e.g. 5m)?
        alt Overdue Consultation
            Note over Server: Sets isDelayed = true.<br/>Adds delay seconds to all waiting ETAs.
        else Within Consultation Time Limit
            Note over Server: Sets isDelayed = false.
        end
        Server-->>Front: emit("state-update", QueueState)
        Server-->>Display: emit("state-update", QueueState)
        Note over Front: Updates active clock.<br/>Shows "Consultation Delayed" badge.
        Note over Display: Displays "Doctor Delay Detected".<br/>Updates patient lookup ETAs.
    end
```
