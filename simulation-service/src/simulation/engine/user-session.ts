export interface UserSession {
  userId: string;
  sessionId: string;
  videoId: string;
  watchDurationMs: number;
  playheadMs: number;
  lastHeartbeatAt: number;
}

export interface NewSessionInput {
  userId: string;
  videoId: string;
  watchDurationMs: number;
  nowMs: number;
  /** Optional stable prefix for easier debugging */
  sessionPrefix?: string;
}

export function createUserSession(input: NewSessionInput): UserSession {
  const prefix = input.sessionPrefix ?? 'sim';
  return {
    userId: input.userId,
    sessionId: `${prefix}-${input.userId}-${Math.random().toString(36).slice(2, 8)}`,
    videoId: input.videoId,
    watchDurationMs: input.watchDurationMs,
    playheadMs: 0,
    lastHeartbeatAt: input.nowMs,
  };
}
