import fs from 'fs';
import path from 'path';
import { QueueManager } from './queueManager';
import { MultiCabinState, QueueState } from './types';

interface CabinConfig {
  cabinId: string;
  cabinLabel: string;
  doctorName: string;
}

const DEFAULT_CABINS: CabinConfig[] = [
  { cabinId: 'cabin-01', cabinLabel: 'Cabin 01', doctorName: 'Sharma' },
  { cabinId: 'cabin-02', cabinLabel: 'Cabin 02', doctorName: 'Gupta' },
  { cabinId: 'cabin-03', cabinLabel: 'Cabin 03', doctorName: 'Verma' },
];

const COUNTER_FILE_PATH = path.join(__dirname, '../global-token-counter.json');

export class CabinRegistry {
  private globalTokenCounter: number = 0;
  private cabins: Map<string, QueueManager> = new Map();

  constructor() {
    this.loadGlobalCounter();
    this.initDefaultCabins();
    console.log(`CabinRegistry initialized with ${this.cabins.size} cabins. Global token: ${this.globalTokenCounter}`);
  }

  // ─── Token Factory ────────────────────────────────────────────────────────

  public getNextToken(): string {
    this.globalTokenCounter++;
    this.saveGlobalCounter();
    return `QC-${String(this.globalTokenCounter).padStart(3, '0')}`;
  }

  public getGlobalTokenCounter(): number {
    return this.globalTokenCounter;
  }

  private saveGlobalCounter(): void {
    try {
      fs.writeFileSync(
        COUNTER_FILE_PATH,
        JSON.stringify({ globalTokenCounter: this.globalTokenCounter }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('Failed to save global token counter:', e);
    }
  }

  private loadGlobalCounter(): void {
    try {
      if (fs.existsSync(COUNTER_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(COUNTER_FILE_PATH, 'utf8'));
        this.globalTokenCounter = data.globalTokenCounter || 0;
        console.log(`Global token counter restored: ${this.globalTokenCounter}`);
      }
    } catch (e) {
      console.warn('Failed to load global token counter, starting from 0');
      this.globalTokenCounter = 0;
    }
  }

  // ─── Cabin Management ─────────────────────────────────────────────────────

  private initDefaultCabins(): void {
    for (const cfg of DEFAULT_CABINS) {
      const manager = new QueueManager(
        cfg.cabinId,
        cfg.cabinLabel,
        cfg.doctorName,
        () => this.getNextToken()
      );
      this.cabins.set(cfg.cabinId, manager);
    }
  }

  public getCabin(cabinId: string): QueueManager | null {
    return this.cabins.get(cabinId) || null;
  }

  public getCabinIds(): string[] {
    return Array.from(this.cabins.keys());
  }

  public getCabinConfigs(): Array<{ cabinId: string; cabinLabel: string; doctorName: string; status: string; queueLength: number }> {
    return Array.from(this.cabins.entries()).map(([cabinId, manager]) => {
      const state = manager.getState();
      return {
        cabinId,
        cabinLabel: state.roomInfo.roomNumber,
        doctorName: state.roomInfo.doctorName,
        status: state.roomInfo.status,
        queueLength: state.waiting.length,
      };
    });
  }

  // ─── State Access ─────────────────────────────────────────────────────────

  public getAllStates(): Record<string, QueueState> {
    const result: Record<string, QueueState> = {};
    for (const [id, manager] of this.cabins) {
      result[id] = manager.getState();
    }
    return result;
  }

  public getMultiCabinState(): MultiCabinState {
    return {
      cabins: this.getAllStates(),
      globalTokenCounter: this.globalTokenCounter,
    };
  }

  // ─── Tick ─────────────────────────────────────────────────────────────────

  public tickAll(): void {
    for (const manager of this.cabins.values()) {
      manager.tickActivePatient(1);
    }
  }
}
