// Use /api/go and /api/sim proxy when env not set (avoids CORS)
export const GO_API_BASE = process.env.NEXT_PUBLIC_GO_API_URL ?? '/api/go';
export const SIMULATION_BASE = process.env.NEXT_PUBLIC_SIMULATION_URL ?? '/api/sim';
