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
const run_manager_1 = require("./run-manager");
const task_manager_1 = require("./task-manager");
const TICK_MS = 100;
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';
let MasterTickScheduler = MasterTickScheduler_1 = class MasterTickScheduler {
    taskManager;
    runManager;
    logger = new common_1.Logger(MasterTickScheduler_1.name);
    intervalId = null;
    playheads = new Map();
    elapsedTicks = 0;
    activeUsers = 0;
    usersPerRampTick = 0;
    stopped = false;
    paused = false;
    spikeOverlayUsers = 0;
    spikeOverlayEndMs = 0;
    constructor(taskManager, runManager) {
        this.taskManager = taskManager;
        this.runManager = runManager;
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
        this.stopped = true;
        this.logger.log('Master tick scheduler stopped');
    }
    beginRun(scenario) {
        this.runManager.startRun(scenario);
        this.playheads.clear();
        this.elapsedTicks = 0;
        this.activeUsers = 0;
        this.usersPerRampTick = Math.max(1, Math.floor(scenario.users / Math.max(scenario.ramp_up_seconds * (1000 / TICK_MS), 1)));
        this.stopped = false;
    }
    endRun() {
        this.stopped = true;
        this.paused = false;
        this.spikeOverlayUsers = 0;
        this.runManager.stopRun();
    }
    switchPhase(scenario) {
        this.runManager.switchPhase(scenario);
        this.playheads.clear();
        this.elapsedTicks = 0;
        this.activeUsers = 0;
        this.usersPerRampTick = Math.max(1, Math.floor(scenario.users / Math.max(scenario.ramp_up_seconds * (1000 / TICK_MS), 1)));
        this.stopped = false;
    }
    setPaused(p) {
        this.paused = p;
    }
    isPaused() {
        return this.paused;
    }
    injectSpikeOverlay(users = 3000, durationSec = 5) {
        this.spikeOverlayUsers = users;
        this.spikeOverlayEndMs = Date.now() + durationSec * 1000;
        this.logger.log(`spike overlay: +${users} users for ${durationSec}s`);
    }
    getActiveUsers() {
        return this.activeUsers;
    }
    getElapsedTicks() {
        return this.elapsedTicks;
    }
    async tick() {
        const state = this.runManager.getState();
        if (!state.running || this.stopped || !state.scenario) {
            return;
        }
        if (this.spikeOverlayUsers > 0 && Date.now() >= this.spikeOverlayEndMs) {
            this.spikeOverlayUsers = 0;
        }
        const scenario = state.scenario;
        const rampTicks = Math.ceil((scenario.ramp_up_seconds * 1000) / TICK_MS);
        if (this.elapsedTicks < rampTicks) {
            this.activeUsers = Math.min(this.activeUsers + this.usersPerRampTick, scenario.users);
        }
        else {
            this.activeUsers = scenario.users;
        }
        if (this.paused) {
            this.elapsedTicks++;
            return;
        }
        const effectiveUsers = this.activeUsers + this.spikeOverlayUsers;
        const config = {
            targetUrl: DEFAULT_API_URL,
            scenario,
            getActiveUsers: () => effectiveUsers,
            getElapsedTicks: () => this.elapsedTicks,
        };
        const { sent, errors } = await this.taskManager.executeTick(config, this.playheads);
        this.runManager.recordTick(sent, errors);
        this.elapsedTicks++;
        const elapsedSeconds = (this.elapsedTicks * TICK_MS) / 1000;
        if (scenario.duration_seconds && elapsedSeconds >= scenario.duration_seconds) {
            this.logger.log(`simulation duration reached (${scenario.duration_seconds}s), stopping`);
            this.endRun();
        }
    }
};
exports.MasterTickScheduler = MasterTickScheduler;
exports.MasterTickScheduler = MasterTickScheduler = MasterTickScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [task_manager_1.TaskManager,
        run_manager_1.RunManager])
], MasterTickScheduler);
//# sourceMappingURL=master-tick-scheduler.js.map