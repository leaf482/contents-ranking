// Use /api/go and /api/sim proxy when env not set (avoids CORS)
export const GO_API_BASE = process.env.NEXT_PUBLIC_GO_API_URL ?? '/api/go';
export const SIMULATION_BASE = process.env.NEXT_PUBLIC_SIMULATION_URL ?? '/api/sim';

// Trending threshold: only show items with velocity >= threshold.
// Set via NEXT_PUBLIC_TRENDING_VELOCITY_THRESHOLD (e.g. "5").
export const TRENDING_VELOCITY_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_TRENDING_VELOCITY_THRESHOLD ?? 0,
);
