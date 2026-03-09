"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCENARIO_PRESETS = void 0;
exports.getPreset = getPreset;
exports.listPresets = listPresets;
exports.SCENARIO_PRESETS = [
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
function getPreset(id) {
    return exports.SCENARIO_PRESETS.find((p) => p.id === id);
}
function listPresets() {
    return [...exports.SCENARIO_PRESETS];
}
//# sourceMappingURL=presets.constants.js.map