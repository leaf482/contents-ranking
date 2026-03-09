"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenarioRegistry = void 0;
const DEFAULT_RAMP_TICKS = 100;
function defaultRampTicks(users) {
    return Math.max(10, Math.min(100, Math.floor(users / 5)));
}
const DEFAULT_VIDEO_IDS = Array.from({ length: 10 }, (_, i) => `video${i + 1}`);
const TEMPLATES = {
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
class ScenarioRegistry {
    scenarios = new Map();
    getAll() {
        return Array.from(this.scenarios.values());
    }
    get(id) {
        return this.scenarios.get(id);
    }
    getRunning() {
        return this.getAll().filter((s) => s.status === 'running');
    }
    has(id) {
        return this.scenarios.has(id);
    }
    createFromTemplate(templateId) {
        const t = TEMPLATES[templateId];
        if (!t)
            return undefined;
        const videoId = t.targetVideoId ?? DEFAULT_VIDEO_IDS[0];
        const scenario = {
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
    create(id, name, config) {
        const scenario = {
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
    setStatus(id, status) {
        const s = this.scenarios.get(id);
        if (s)
            s.status = status;
    }
    setSpike(id, multiplier, durationMs) {
        const s = this.scenarios.get(id);
        if (s) {
            s.loadMultiplier = multiplier;
            s.spikeEndMs = Date.now() + durationMs;
        }
    }
    setSpikeAll(multiplier, durationMs) {
        const endMs = Date.now() + durationMs;
        for (const s of this.scenarios.values()) {
            if (s.status === 'running') {
                s.loadMultiplier = multiplier;
                s.spikeEndMs = endMs;
            }
        }
    }
    updateConfig(id, config) {
        const s = this.scenarios.get(id);
        if (s) {
            s.config = { ...s.config, ...config };
            s.elapsedTicks = 0;
            s.activeUsers = 0;
            s.rampUpTicks = defaultRampTicks(s.config.users);
        }
    }
    recordEmitted(id, count) {
        const s = this.scenarios.get(id);
        if (s)
            s.stats.emittedEvents += count;
    }
    remove(id) {
        this.scenarios.delete(id);
    }
    listTemplates() {
        return Object.values(TEMPLATES);
    }
    getTemplate(id) {
        return TEMPLATES[id];
    }
}
exports.ScenarioRegistry = ScenarioRegistry;
//# sourceMappingURL=scenario-registry.js.map