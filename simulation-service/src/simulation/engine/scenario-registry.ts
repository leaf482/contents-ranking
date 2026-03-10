/**
 * Simulation Factory - Scenario Registry
 * Manages multiple scenarios in memory with Map<string, Scenario>.
 */

export type ScenarioStatus = 'running' | 'paused' | 'stopped';

export interface ScenarioConfig {
  users: number;
  targetVideoId: string;
  watchSeconds: number;
  intervalMs: number;
  /** Optional duration in ticks (100ms each). When reached, scenario stops. */
  durationTicks?: number;
}

export interface ScenarioStats {
  emittedEvents: number;
}

const DEFAULT_RAMP_TICKS = 100; // 10s at 100ms tick

export interface Scenario {
  id: string;
  name: string;
  status: ScenarioStatus;
  config: ScenarioConfig;
  stats: ScenarioStats;
  elapsedTicks: number;
  activeUsers: number;
  rampUpTicks: number;
  playheads: Map<string, number>;
  /** Chaos: temporary load multiplier (e.g. 5 for 5x spike) */
  loadMultiplier?: number;
  /** When loadMultiplier expires (Unix ms) */
  spikeEndMs?: number;
}

function defaultRampTicks(users: number): number {
  return Math.max(10, Math.min(100, Math.floor(users / 5)));
}

/** Template for creating scenarios (presets) */
export interface ScenarioTemplate {
  id: string;
  name: string;
  users: number;
  targetVideoId?: string;
  watchSeconds: number;
  intervalMs: number;
  duration_seconds?: number;
}

const DEFAULT_VIDEO_IDS = [
  'MrBeast Challenge',
  'Street Interview',
  "Life Hack: Don't",
  'GRWM for Prom',
  'Golden Retriever',
  'Restocking My Fridge',
  'Day in my Life',
  "POV: You're Late",
  'I Won 10,000$',
  'Is it Cake?',
];

const TEMPLATES: Record<string, ScenarioTemplate> = {
  normal: {
    id: 'normal',
    name: 'Normal',
    users: 100,
    watchSeconds: 30,
    intervalMs: 500,
    duration_seconds: 120,
  },
  normal_300: {
    id: 'normal_300',
    name: 'Normal (300 users)',
    users: 300,
    watchSeconds: 30,
    intervalMs: 500,
    duration_seconds: 120,
  },
  normal_500: {
    id: 'normal_500',
    name: 'Normal (500 users)',
    users: 500,
    watchSeconds: 30,
    intervalMs: 500,
    duration_seconds: 120,
  },
  spike: {
    id: 'spike',
    name: 'Spike',
    users: 500,
    watchSeconds: 30,
    intervalMs: 250,
    duration_seconds: 180,
  },
  slowdown: {
    id: 'slowdown',
    name: 'Slowdown',
    users: 300,
    watchSeconds: 30,
    intervalMs: 1000,
    duration_seconds: 120,
  },
  load_test: {
    id: 'load_test',
    name: 'Load Test (100→300→500→1000)',
    users: 100,
    watchSeconds: 30,
    intervalMs: 500,
    duration_seconds: 600,
  },
};

export class ScenarioRegistry {
  private scenarios = new Map<string, Scenario>();

  getAll(): Scenario[] {
    return Array.from(this.scenarios.values());
  }

  get(id: string): Scenario | undefined {
    return this.scenarios.get(id);
  }

  getRunning(): Scenario[] {
    return this.getAll().filter((s) => s.status === 'running');
  }

  has(id: string): boolean {
    return this.scenarios.has(id);
  }

  createFromTemplate(templateId: string): Scenario | undefined {
    const t = TEMPLATES[templateId];
    if (!t) return undefined;

    const videoId = t.targetVideoId ?? DEFAULT_VIDEO_IDS[0];
    const scenario: Scenario = {
      id: t.id,
      name: t.name,
      status: 'running',
      config: {
        users: t.users,
        targetVideoId: videoId,
        watchSeconds: t.watchSeconds,
        intervalMs: t.intervalMs,
      },
      stats: { emittedEvents: 0 },
      elapsedTicks: 0,
      activeUsers: 0,
      rampUpTicks: defaultRampTicks(t.users),
      playheads: new Map(),
    };
    this.scenarios.set(t.id, scenario);
    return scenario;
  }

  create(id: string, name: string, config: ScenarioConfig): Scenario {
    const scenario: Scenario = {
      id,
      name,
      status: 'running',
      config: { ...config },
      stats: { emittedEvents: 0 },
      elapsedTicks: 0,
      activeUsers: 0,
      rampUpTicks: defaultRampTicks(config.users),
      playheads: new Map(),
    };
    this.scenarios.set(id, scenario);
    return scenario;
  }

  setStatus(id: string, status: ScenarioStatus): void {
    const s = this.scenarios.get(id);
    if (s) s.status = status;
  }

  /** Apply load spike to scenario for durationMs */
  setSpike(id: string, multiplier: number, durationMs: number): void {
    const s = this.scenarios.get(id);
    if (s) {
      s.loadMultiplier = multiplier;
      s.spikeEndMs = Date.now() + durationMs;
    }
  }

  /** Apply load spike to all running scenarios */
  setSpikeAll(multiplier: number, durationMs: number): void {
    const endMs = Date.now() + durationMs;
    for (const s of this.scenarios.values()) {
      if (s.status === 'running') {
        s.loadMultiplier = multiplier;
        s.spikeEndMs = endMs;
      }
    }
  }

  /** Update config (e.g. load_test phase switch) without resetting stats */
  updateConfig(id: string, config: Partial<ScenarioConfig>): void {
    const s = this.scenarios.get(id);
    if (s) {
      s.config = { ...s.config, ...config };
      s.elapsedTicks = 0;
      s.activeUsers = 0;
      s.rampUpTicks = defaultRampTicks(s.config.users);
    }
  }

  recordEmitted(id: string, count: number): void {
    const s = this.scenarios.get(id);
    if (s) s.stats.emittedEvents += count;
  }

  remove(id: string): void {
    this.scenarios.delete(id);
  }

  listTemplates(): ScenarioTemplate[] {
    return Object.values(TEMPLATES);
  }

  getTemplate(id: string): ScenarioTemplate | undefined {
    return TEMPLATES[id];
  }
}
