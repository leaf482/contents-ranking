"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserSession = createUserSession;
function createUserSession(input) {
    const prefix = input.sessionPrefix ?? 'sim';
    return {
        userId: input.userId,
        sessionId: `${prefix}-${input.userId}-${Math.random().toString(36).slice(2, 8)}`,
        videoId: input.videoId,
        watchDurationMs: input.watchDurationMs,
        playheadMs: 0,
        lastHeartbeatAt: input.nowMs,
        heartbeatIntervalMs: 500,
        nextHeartbeatDueAt: input.nowMs + 500,
    };
}
//# sourceMappingURL=user-session.js.map