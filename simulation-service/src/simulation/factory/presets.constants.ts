/**
 * Scenario Presets - Predefined traffic patterns for the Simulation Factory.
 * Uses 1x real-time playback (playhead += intervalMs per heartbeat).
 * Worker threshold: 30s accumulated watch time = 1 ranking point.
 */

export interface ScenarioPreset {
  id: string;
  name: string;
  description?: string;
  users: number;
  watchSeconds: number;
  intervalMs: number;
  /** Default duration in seconds (0 = until manual stop). User can override. */
  durationSeconds?: number;
  /** watchSeconds < 30: Score will NOT increase (worker threshold) */
  scoreIncreases?: boolean;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'hot_trending',
    name: 'Hot Trending',
    description: 'High engagement, 60s watch',
    users: 1000,
    watchSeconds: 60,
    intervalMs: 500,
    durationSeconds: 120,
    scoreIncreases: true,
  },
  {
    id: 'regular',
    name: 'Regular',
    description: 'Standard load',
    users: 100,
    watchSeconds: 30,
    intervalMs: 500,
    durationSeconds: 120,
    scoreIncreases: true,
  },
  {
    id: 'mild_trending',
    name: 'Mild Trending',
    description: 'Moderate engagement',
    users: 500,
    watchSeconds: 30,
    intervalMs: 500,
    durationSeconds: 120,
    scoreIncreases: true,
  },
  {
    id: 'half_hot_trending',
    name: 'Half Hot Trending',
    description: '20s watch — Score does NOT increase (< 30s threshold)',
    users: 1000,
    watchSeconds: 20,
    intervalMs: 500,
    durationSeconds: 120,
    scoreIncreases: false,
  },
  {
    id: 'viral_spike',
    name: 'Viral Spike',
    description: 'High burst, 35s watch',
    users: 2000,
    watchSeconds: 35,
    intervalMs: 500,
    durationSeconds: 120,
    scoreIncreases: true,
  },
  {
    id: 'noise_traffic',
    name: 'Noise Traffic',
    description: 'Spam-like, 5s watch — Score does NOT increase (< 30s threshold)',
    users: 1500,
    watchSeconds: 5,
    intervalMs: 500,
    durationSeconds: 60,
    scoreIncreases: false,
  },
  {
    id: 'long_engagement',
    name: 'Long Engagement',
    description: 'Deep watch, 120s',
    users: 200,
    watchSeconds: 120,
    intervalMs: 500,
    durationSeconds: 180,
    scoreIncreases: true,
  },
];

export function getPreset(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((p) => p.id === id);
}

export function listPresets(): ScenarioPreset[] {
  return [...SCENARIO_PRESETS];
}
