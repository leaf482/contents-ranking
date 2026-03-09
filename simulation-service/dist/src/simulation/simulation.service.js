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
var SimulationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationService = void 0;
const common_1 = require("@nestjs/common");
const scenario_registry_1 = require("./engine/scenario-registry");
const load_test_phases_1 = require("./engine/load-test-phases");
const master_tick_scheduler_1 = require("./engine/master-tick-scheduler");
const run_manager_1 = require("./engine/run-manager");
let SimulationService = SimulationService_1 = class SimulationService {
    scheduler;
    runManager;
    logger = new common_1.Logger(SimulationService_1.name);
    loadTestPhaseIndex = 0;
    constructor(scheduler, runManager) {
        this.scheduler = scheduler;
        this.runManager = runManager;
    }
    onModuleInit() {
        this.scheduler.start();
    }
    start(scenario) {
        if (this.runManager.getState().running) {
            throw new common_1.ConflictException('A simulation is already running');
        }
        this.scheduler.beginRun(scenario);
        const state = this.runManager.getState();
        this.logger.log(`run_id=${state.run_id} starting type=${scenario.type} users=${scenario.users} eps=${scenario.events_per_second}`);
        return {
            running: state.running,
            scenario: state.scenario,
            sent: state.sent,
            errors: state.errors,
            started_at: state.started_at,
        };
    }
    startByScenarioId(scenarioId) {
        if (scenarioId === 'load_test') {
            return this.runLoadTest();
        }
        const registered = (0, scenario_registry_1.getScenario)(scenarioId);
        if (!registered) {
            throw new common_1.ConflictException(`Unknown scenario: ${scenarioId}`);
        }
        const scenario = (0, scenario_registry_1.toSimulationScenario)(registered);
        return this.start(scenario);
    }
    runLoadTest() {
        if (this.runManager.getState().running) {
            throw new common_1.ConflictException('A simulation is already running');
        }
        this.loadTestPhaseIndex = 0;
        const phase = load_test_phases_1.LOAD_TEST_PHASES[0];
        const scenario = (0, load_test_phases_1.phaseToScenario)(phase);
        this.scheduler.beginRun(scenario);
        const state = this.runManager.getState();
        this.logger.log(`load_test run_id=${state.run_id} starting ${phase.name} (${phase.users} users, ${phase.duration_seconds}s)`);
        this.scheduleNextPhase();
        return {
            running: state.running,
            scenario: state.scenario,
            sent: state.sent,
            errors: state.errors,
            started_at: state.started_at,
        };
    }
    scheduleNextPhase() {
        const phase = load_test_phases_1.LOAD_TEST_PHASES[this.loadTestPhaseIndex];
        const durationMs = (0, load_test_phases_1.getPhaseDurationMs)(phase);
        setTimeout(() => {
            const state = this.runManager.getState();
            if (!state.running)
                return;
            this.scheduler.endRun();
            this.loadTestPhaseIndex++;
            if (this.loadTestPhaseIndex >= load_test_phases_1.LOAD_TEST_PHASES.length) {
                this.logger.log(`load_test complete — sent=${state.sent} errors=${state.errors}`);
                return;
            }
            setTimeout(() => {
                const nextPhase = load_test_phases_1.LOAD_TEST_PHASES[this.loadTestPhaseIndex];
                const scenario = (0, load_test_phases_1.phaseToScenario)(nextPhase);
                this.scheduler.switchPhase(scenario);
                this.logger.log(`load_test ${nextPhase.name} (${nextPhase.users} users, ${nextPhase.duration_seconds}s)`);
                this.scheduleNextPhase();
            }, load_test_phases_1.COOLDOWN_MS);
        }, durationMs);
    }
    stop() {
        this.scheduler.endRun();
        const state = this.runManager.getState();
        this.logger.log(`run_id=${state.run_id} stopped — sent=${state.sent} errors=${state.errors}`);
        return {
            running: false,
            scenario: state.scenario,
            sent: state.sent,
            errors: state.errors,
            started_at: state.started_at,
        };
    }
    getStatus() {
        const state = this.runManager.getState();
        return {
            ...state,
            run_id: state.run_id,
            paused: this.scheduler.isPaused(),
        };
    }
    pause() {
        this.scheduler.setPaused(true);
        this.logger.log('simulation paused');
    }
    resume() {
        this.scheduler.setPaused(false);
        this.logger.log('simulation resumed');
    }
    injectSpike(users = 3000, durationSec = 5) {
        this.scheduler.injectSpikeOverlay(users, durationSec);
    }
};
exports.SimulationService = SimulationService;
exports.SimulationService = SimulationService = SimulationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [master_tick_scheduler_1.MasterTickScheduler,
        run_manager_1.RunManager])
], SimulationService);
//# sourceMappingURL=simulation.service.js.map