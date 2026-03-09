"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MasterTickScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterTickScheduler = void 0;
const common_1 = require("@nestjs/common");
const scenario_registry_1 = require("./scenario-registry");
const command_queue_1 = require("./command-queue");
const attribution_index_1 = require("./attribution-index");
const batch_sender_1 = require("./batch-sender");
const event_log_service_1 = require("../events/event-log.service");
const event_stream_service_1 = require("../events/event-stream.service");
const TICK_MS = 100;
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';
let MasterTickScheduler = MasterTickScheduler_1 = class MasterTickScheduler {
    registry;
    commandQueue;
    attributionIndex;
    batchSender;
    eventLog;
    eventStream;
    logger = new common_1.Logger(MasterTickScheduler_1.name);
    intervalId = null;
    constructor(registry, commandQueue, attributionIndex, batchSender, eventLog, eventStream) {
        this.registry = registry;
        this.commandQueue = commandQueue;
        this.attributionIndex = attributionIndex;
        this.batchSender = batchSender;
        this.eventLog = eventLog;
        this.eventStream = eventStream;
    }
    onModuleDestroy() {
        this.stop();
    }
    start() {
        if (this.intervalId)
            return;
        this.intervalId = setInterval(() => this.tick(), TICK_MS);
        this.logger.log('Master tick scheduler started (100ms period)');
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.logger.log('Master tick scheduler stopped');
    }
    enqueueStart(scenarioId, name, config) {
        this.commandQueue.enqueue({
            scenarioId,
            command: 'start',
            name,
            config,
        });
    }
    enqueuePause(scenarioId) {
        this.commandQueue.enqueue({ scenarioId, command: 'pause' });
    }
    enqueueResume(scenarioId) {
        this.commandQueue.enqueue({ scenarioId, command: 'resume' });
    }
    enqueueStop(scenarioId) {
        this.commandQueue.enqueue({ scenarioId, command: 'stop' });
    }
    enqueueSwitchPhase(scenarioId, config) {
        this.commandQueue.enqueue({
            scenarioId,
            command: 'switch_phase',
            config,
        });
    }
    enqueueSpike(scenarioId, multiplier, durationMs) {
        const s = this.registry.get(scenarioId);
        if (s)
            this.registry.setSpike(scenarioId, multiplier, durationMs);
    }
    enqueueLoadSpike(multiplier, durationMs) {
        this.registry.setSpikeAll(multiplier, durationMs);
    }
    applyCommands(commands) {
        for (const cmd of commands) {
            switch (cmd.command) {
                case 'start':
                    if (cmd.config && cmd.name) {
                        const existing = this.registry.get(cmd.scenarioId);
                        if (existing) {
                            this.attributionIndex.clearScenario(cmd.scenarioId, existing.config.targetVideoId);
                        }
                        const scenario = this.registry.create(cmd.scenarioId, cmd.name, cmd.config);
                        if (cmd.initialStatus === 'paused') {
                            this.registry.setStatus(cmd.scenarioId, 'paused');
                        }
                        this.attributionIndex.setScenarioVideo(cmd.scenarioId, cmd.config.targetVideoId);
                        this.eventLog.record('start', cmd.scenarioId);
                        this.logger.log(`started ${cmd.scenarioId} (${cmd.config.users} users)${cmd.initialStatus === 'paused' ? ' [paused]' : ''}`);
                    }
                    break;
                case 'pause':
                    this.registry.setStatus(cmd.scenarioId, 'paused');
                    this.eventLog.record('pause', cmd.scenarioId);
                    this.logger.debug(`paused ${cmd.scenarioId}`);
                    break;
                case 'resume':
                    this.registry.setStatus(cmd.scenarioId, 'running');
                    this.eventLog.record('resume', cmd.scenarioId);
                    this.logger.debug(`resumed ${cmd.scenarioId}`);
                    break;
                case 'stop':
                    const s = this.registry.get(cmd.scenarioId);
                    if (s) {
                        this.attributionIndex.clearScenario(cmd.scenarioId, s.config.targetVideoId);
                        this.registry.setStatus(cmd.scenarioId, 'stopped');
                        this.registry.remove(cmd.scenarioId);
                        this.eventLog.record('stop', cmd.scenarioId);
                        this.logger.log(`stopped ${cmd.scenarioId}`);
                    }
                    break;
                case 'switch_phase':
                    if (cmd.config) {
                        const existing = this.registry.get(cmd.scenarioId);
                        if (existing) {
                            this.attributionIndex.clearScenario(cmd.scenarioId, existing.config.targetVideoId);
                        }
                        this.registry.updateConfig(cmd.scenarioId, cmd.config);
                        if (cmd.config.targetVideoId) {
                            this.attributionIndex.setScenarioVideo(cmd.scenarioId, cmd.config.targetVideoId);
                        }
                        this.logger.log(`switch_phase ${cmd.scenarioId} (${cmd.config.users} users)`);
                    }
                    break;
            }
        }
    }
    computeEventsPerTick(scenario) {
        const { intervalMs } = scenario.config;
        const activeUsers = scenario.activeUsers;
        if (activeUsers <= 0)
            return 0;
        let events = Math.round((activeUsers * TICK_MS) / intervalMs);
        if (scenario.loadMultiplier && scenario.spikeEndMs && Date.now() < scenario.spikeEndMs) {
            events = Math.round(events * scenario.loadMultiplier);
        }
        else if (scenario.spikeEndMs && Date.now() >= scenario.spikeEndMs) {
            scenario.loadMultiplier = undefined;
            scenario.spikeEndMs = undefined;
        }
        return events;
    }
    buildPayloads(scenario, count) {
        const { targetVideoId, watchSeconds } = scenario.config;
        const prefix = `${scenario.id}-`;
        const payloads = [];
        const now = Date.now();
        for (let i = 0; i < count; i++) {
            const userIdx = i % scenario.activeUsers;
            const userId = `${prefix}user-${userIdx + 1}`;
            const prev = scenario.playheads.get(userId) ?? 0;
            const next = prev + watchSeconds * 1000;
            scenario.playheads.set(userId, next);
            payloads.push({
                session_id: `sim-${userId}`,
                user_id: userId,
                video_id: targetVideoId,
                playhead: next,
                timestamp: now,
            });
        }
        return payloads;
    }
    async tick() {
        const commands = this.commandQueue.drain();
        if (commands.length > 0) {
            this.applyCommands(commands);
        }
        const running = this.registry.getRunning();
        if (running.length === 0)
            return;
        const allPayloads = [];
        const countsPerScenario = new Map();
        for (const scenario of running) {
            scenario.elapsedTicks++;
            if (scenario.config.durationTicks && scenario.elapsedTicks >= scenario.config.durationTicks) {
                this.attributionIndex.clearScenario(scenario.id, scenario.config.targetVideoId);
                this.registry.remove(scenario.id);
                this.logger.log(`scenario ${scenario.id} duration reached, stopped`);
                continue;
            }
            if (scenario.elapsedTicks < scenario.rampUpTicks) {
                scenario.activeUsers = Math.min(scenario.activeUsers + Math.max(1, Math.floor(scenario.config.users / scenario.rampUpTicks)), scenario.config.users);
            }
            else {
                scenario.activeUsers = scenario.config.users;
            }
            const eventsCount = this.computeEventsPerTick(scenario);
            if (eventsCount > 0) {
                const payloads = this.buildPayloads(scenario, eventsCount);
                allPayloads.push(...payloads);
                countsPerScenario.set(scenario.id, payloads.length);
            }
        }
        if (allPayloads.length > 0) {
            this.eventStream.pushBatch(allPayloads.map((p) => ({ user_id: p.user_id, video_id: p.video_id })));
            const { sent } = await this.batchSender.sendBatch(allPayloads, DEFAULT_API_URL);
            const ratio = sent / allPayloads.length;
            for (const [id, count] of countsPerScenario) {
                const s = this.registry.get(id);
                if (s)
                    s.stats.emittedEvents += Math.round(count * ratio);
            }
        }
    }
    getRegistry() {
        return this.registry;
    }
};
exports.MasterTickScheduler = MasterTickScheduler;
exports.MasterTickScheduler = MasterTickScheduler = MasterTickScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [scenario_registry_1.ScenarioRegistry,
        command_queue_1.CommandQueue,
        attribution_index_1.AttributionIndex,
        batch_sender_1.BatchSender,
        event_log_service_1.EventLogService,
        event_stream_service_1.EventStreamService])
], MasterTickScheduler);
//# sourceMappingURL=master-tick-scheduler.js.map