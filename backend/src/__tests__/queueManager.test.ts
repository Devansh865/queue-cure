import { QueueManager } from '../queueManager';
import fs from 'fs';
import path from 'path';

// Clean up cabin-scoped state file before and after tests
let globalTokenCounter = 0;
const getNextToken = () => `QC-${String(++globalTokenCounter).padStart(3, '0')}`;
const stateFilePath = path.join(__dirname, '../../queue-state-test-cabin.json');
const cleanStateFile = () => {
  if (fs.existsSync(stateFilePath)) {
    try { fs.unlinkSync(stateFilePath); } catch (e) {}
  }
};

describe('QueueManager Unit Tests', () => {
  let queueManager: QueueManager;

  beforeEach(() => {
    globalTokenCounter = 0;
    cleanStateFile();
    queueManager = new QueueManager('test-cabin', 'Cabin Test', 'TestDoctor', getNextToken);
  });

  afterEach(() => {
    cleanStateFile();
  });

  test('should initialize with an empty state', () => {
    const state = queueManager.getState();
    expect(state.cabinId).toBe('test-cabin');
    expect(state.waiting).toHaveLength(0);
    expect(state.active).toBeNull();
    expect(state.missed).toHaveLength(0);
    expect(state.served).toHaveLength(0);
    expect(state.averageConsultationTime).toBe(5);
  });

  test('should add patient and assign token correctly', () => {
    const patient = queueManager.addPatient('Alice Smith', 'Fever', 'normal');
    expect(patient).toBeDefined();
    expect(patient?.name).toBe('Alice Smith');
    expect(patient?.token).toBe('QC-001');
    expect(patient?.priority).toBe('normal');
    expect(patient?.status).toBe('waiting');

    const state = queueManager.getState();
    expect(state.waiting).toHaveLength(1);
    expect(state.waiting[0].id).toBe(patient?.id);
  });

  test('should handle duplicate patient names by appending suffix', () => {
    const p1 = queueManager.addPatient('Alice Smith', 'Fever', 'normal');
    const p2 = queueManager.addPatient('Alice Smith', 'Cough', 'normal');

    expect(p1?.name).toBe('Alice Smith');
    expect(p2?.name).toBe('Alice Smith (2)');
  });

  test('should sort waiting queue by priority (Emergency > Urgent > Normal)', () => {
    queueManager.addPatient('Alice (Normal)', 'Fever', 'normal');
    queueManager.addPatient('Bob (Emergency)', 'Chest Pain', 'emergency');
    queueManager.addPatient('Charlie (Urgent)', 'Fracture', 'urgent');
    queueManager.addPatient('David (Normal 2)', 'Headache', 'normal');

    const state = queueManager.getState();
    expect(state.waiting).toHaveLength(4);
    
    // Check sorted priority weights
    expect(state.waiting[0].name).toContain('Emergency'); // index 0
    expect(state.waiting[1].name).toContain('Urgent');    // index 1
    expect(state.waiting[2].name).toContain('Normal');    // index 2 (Alice, because she arrived first)
    expect(state.waiting[3].name).toContain('Normal 2');  // index 3
  });

  test('should transition patient through serving and served states on callNext', () => {
    const p1 = queueManager.addPatient('Alice', 'Fever', 'normal');
    const p2 = queueManager.addPatient('Bob', 'Cough', 'normal');

    // Call first patient
    const call1 = queueManager.callNext();
    expect(call1?.active?.id).toBe(p1?.id);
    expect(call1?.active?.status).toBe('serving');
    expect(call1?.served).toBeNull();

    let state = queueManager.getState();
    expect(state.active?.id).toBe(p1?.id);
    expect(state.waiting).toHaveLength(1);
    expect(state.waiting[0].id).toBe(p2?.id);

    // Call next patient
    const call2 = queueManager.callNext();
    expect(call2?.active?.id).toBe(p2?.id);
    expect(call2?.active?.status).toBe('serving');
    expect(call2?.served?.id).toBe(p1?.id);
    expect(call2?.served?.status).toBe('served');

    state = queueManager.getState();
    expect(state.active?.id).toBe(p2?.id);
    expect(state.served).toHaveLength(1);
    expect(state.served[0].id).toBe(p1?.id);
    expect(state.waiting).toHaveLength(0);
  });

  test('should skip patient and move to missed queue', () => {
    queueManager.addPatient('Alice', 'Fever', 'normal');
    queueManager.callNext();

    const skipped = queueManager.skipPatient();
    expect(skipped?.status).toBe('skipped');

    const state = queueManager.getState();
    expect(state.active).toBeNull();
    expect(state.missed).toHaveLength(1);
    expect(state.missed[0].id).toBe(skipped?.id);
  });

  test('should recall missed patient and place them at the front of wait list', () => {
    queueManager.addPatient('Alice', 'Fever', 'normal');
    queueManager.addPatient('Bob', 'Cough', 'normal');
    
    // Call Alice and skip her
    queueManager.callNext();
    const skippedAlice = queueManager.skipPatient();
    expect(skippedAlice).toBeDefined();

    // Call Bob
    queueManager.callNext();

    // Recall Alice
    const recalledAlice = queueManager.recallPatient(skippedAlice!.id);
    expect(recalledAlice?.status).toBe('waiting');

    const state = queueManager.getState();
    expect(state.waiting).toHaveLength(1);
    expect(state.waiting[0].id).toBe(skippedAlice?.id); // Alice is placed at the front of the queue
    expect(state.missed).toHaveLength(0);
  });

  test('should perform smart ETA calculation and update active patient ticking', () => {
    queueManager.updateConfig(5); // 5 minutes = 300 seconds
    const p1 = queueManager.addPatient('Alice', 'Fever', 'normal');
    const p2 = queueManager.addPatient('Bob', 'Cough', 'normal');
    
    // Initial wait times when waitlist is just there (no active patient)
    // p1 position 0 -> ETA = (0 * 300) + 0 = 0
    // p2 position 1 -> ETA = (1 * 300) + 0 = 300
    let state = queueManager.getState();
    expect(state.waiting[0].estimatedWaitTime).toBe(0);
    expect(state.waiting[1].estimatedWaitTime).toBe(300);

    // Call Alice
    queueManager.callNext();
    
    // Alice is active (elapsed = 0, remaining = 300)
    // p2 (Bob) position 0 -> ETA = (0 * 300) + 300 = 300 seconds
    state = queueManager.getState();
    expect(state.waiting[0].estimatedWaitTime).toBe(300);

    // Tick active patient by 100 seconds
    queueManager.tickActivePatient(100);
    
    // Remaining time = 300 - 100 = 200
    // Bob ETA = 0 * 300 + 200 = 200 seconds
    state = queueManager.getState();
    expect(state.active?.elapsedTime).toBe(100);
    expect(state.waiting[0].estimatedWaitTime).toBe(200);
    expect(state.isDelayed).toBe(false);

    // Tick active patient by another 250 seconds (total elapsed = 350 seconds, exceeds average 300)
    queueManager.tickActivePatient(250);
    
    // Delay seconds = 350 - 300 = 50
    // Bob ETA = (0 * 300) + 0 (active remaining is 0) + 50 (delay offset) = 50 seconds
    state = queueManager.getState();
    expect(state.active?.elapsedTime).toBe(350);
    expect(state.isDelayed).toBe(true);
    expect(state.delaySeconds).toBe(50);
    expect(state.waiting[0].estimatedWaitTime).toBe(50);
  });

  test('should compute confidence and waitFactors correctly', () => {
    // Initial: no patients
    let state = queueManager.getState();
    expect(state.confidence).toBe('high');
    expect(state.waitFactors).toHaveLength(0);

    // Add patients
    queueManager.addPatient('Alice', 'Fever', 'normal');
    queueManager.addPatient('Bob', 'Chest Pain', 'emergency');
    
    state = queueManager.getState();
    // 2 patients in waiting
    expect(state.confidence).toBe('high');
    expect(state.waitFactors.length).toBeGreaterThan(0);
    
    // Check if emergency triage is listed in factors
    const emergencyFactor = state.waitFactors.find(f => f.label.includes('Immediate Attention'));
    expect(emergencyFactor).toBeDefined();

    // Call first patient
    queueManager.callNext();

    // Tick active patient by 350s (average is 300s)
    queueManager.tickActivePatient(350);

    state = queueManager.getState();
    expect(state.isDelayed).toBe(true);
    expect(state.confidence).toBe('medium');

    // Tick active patient further to trigger 'low' confidence (delay >= 180 seconds, total elapsed = 500s, delay = 200s)
    queueManager.tickActivePatient(150);
    state = queueManager.getState();
    expect(state.confidence).toBe('low');

    // Confirm that the overrun delay is part of waitFactors
    const delayFactor = state.waitFactors.find(f => f.label.includes('overrun'));
    expect(delayFactor).toBeDefined();
    expect(delayFactor?.minutes).toBe(4); // 200 seconds delay -> Math.ceil(200 / 60) = 4 mins
  });
});
