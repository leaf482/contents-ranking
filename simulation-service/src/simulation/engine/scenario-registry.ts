/**
 * Scenario Registry: Predefined load patterns for simulation.
 * - Normal: Steady traffic
 * - Spike: Sudden burst of load
 * - Slowdown: Gradual reduction in load
 */

import { SimulationScenario, SimulationType } from '../interfaces/scenario.interface';

const DEFAULT_VIDEO_IDS = Array.from({ length: 20 }, (_, i) => `video${i + 1}`);

export interface RegisteredScenario {
  id: string;
  name: string;
  type: SimulationType;
  users: number;
  duration_seconds: number;
  /** Multiplier for events_per_second (1.0 = normal) */
  loadMultiplier: number;
  /** For Spike: ramp-up seconds before spike; for Slowdown: ramp-down start */
  rampProfile?: {
    /** Seconds to reach full load */
    rampUpSeconds: number;
    /** For Spike: hold duration at peak; for Slowdown: ramp-down duration */
    holdSeconds?: number;
  };
}

const REGISTRY: Record<string, RegisteredScenario> = {
  normal: {
    id: 'normal',
    name: 'Normal',
    type: 'normal',
    users: 100,
    duration_seconds: 120,
    loadMultiplier: 1.0,
    rampProfile: { rampUpSeconds: 10 },
  },
  normal_300: {
    id: 'normal_300',
    name: 'Normal (300 users)',
    type: 'normal',
    users: 300,
    duration_seconds: 120,
    loadMultiplier: 1.0,
    rampProfile: { rampUpSeconds: 15 },
  },
  normal_500: {
    id: 'normal_500',
    name: 'Normal (500 users)',
    type: 'normal',
    users: 500,
    duration_seconds: 120,
    loadMultiplier: 1.0,
    rampProfile: { rampUpSeconds: 20 },
  },
  spike: {
    id: 'spike',
    name: 'Spike',
    type: 'spike',
    users: 500,
    duration_seconds: 180,
    loadMultiplier: 2.0,
    rampProfile: { rampUpSeconds: 5, holdSeconds: 30 },
  },
  slowdown: {
    id: 'slowdown',
    name: 'Slowdown',
    type: 'gradual',
    users: 300,
    duration_seconds: 120,
    loadMultiplier: 0.5,
    rampProfile: { rampUpSeconds: 10, holdSeconds: 60 },
  },
  /** Load Test preset: 100→300→500→1000 users, step-up phases */
  load_test: {
    id: 'load_test',
    name: 'Load Test (100→300→500→1000)',
    type: 'normal',
    users: 100,
    duration_seconds: 600,
    loadMultiplier: 1.0,
    rampProfile: { rampUpSeconds: 10 },
  },
};

export function getScenario(id: string): RegisteredScenario | undefined {
  return REGISTRY[id];
}

export function listScenarios(): RegisteredScenario[] {
  return Object.values(REGISTRY);
}

export function toSimulationScenario(registered: RegisteredScenario): SimulationScenario {
  const rampUp = registered.rampProfile?.rampUpSeconds ?? 10;
  return {
    name: registered.name,
    type: registered.type,
    users: registered.users,
    video_ids: [...DEFAULT_VIDEO_IDS],
    watch_seconds: 30,
    ramp_up_seconds: rampUp,
    events_per_second: Math.round(2 * registered.loadMultiplier), // base ~2 eps
    duration_seconds: registered.duration_seconds,
  };
}
