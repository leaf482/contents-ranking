"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScenario = getScenario;
exports.listScenarios = listScenarios;
exports.toSimulationScenario = toSimulationScenario;
const DEFAULT_VIDEO_IDS = Array.from({ length: 20 }, (_, i) => `video${i + 1}`);
const REGISTRY = {
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
function getScenario(id) {
    return REGISTRY[id];
}
function listScenarios() {
    return Object.values(REGISTRY);
}
function toSimulationScenario(registered) {
    const rampUp = registered.rampProfile?.rampUpSeconds ?? 10;
    return {
        name: registered.name,
        type: registered.type,
        users: registered.users,
        video_ids: [...DEFAULT_VIDEO_IDS],
        watch_seconds: 30,
        ramp_up_seconds: rampUp,
        events_per_second: Math.round(2 * registered.loadMultiplier),
        duration_seconds: registered.duration_seconds,
    };
}
//# sourceMappingURL=scenario-registry.js.map