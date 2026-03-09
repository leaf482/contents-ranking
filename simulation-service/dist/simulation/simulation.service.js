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
const scenario_strategy_1 = require("./strategies/scenario.strategy");
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';
let SimulationService = SimulationService_1 = class SimulationService {
    strategy;
    logger = new common_1.Logger(SimulationService_1.name);
    status = {
        running: false,
        scenario: null,
        sent: 0,
        errors: 0,
        started_at: null,
    };
    handle = null;
    constructor(strategy) {
        this.strategy = strategy;
    }
    start(scenario) {
        if (this.status.running) {
            throw new common_1.ConflictException('A simulation is already running');
        }
        this.status = {
            running: true,
            scenario,
            sent: 0,
            errors: 0,
            started_at: new Date(),
        };
        this.logger.log(`starting simulation type=${scenario.type} users=${scenario.users} eps=${scenario.events_per_second}`);
        this.handle = this.strategy.run(DEFAULT_API_URL, scenario);
        this.handle.onTick((sent, errors) => {
            this.status.sent += sent;
            this.status.errors += errors;
        });
        return { ...this.status };
    }
    stop() {
        this.handle?.stop();
        this.handle = null;
        this.status.running = false;
        this.logger.log(`simulation stopped — total sent=${this.status.sent} errors=${this.status.errors}`);
        return { ...this.status };
    }
    getStatus() {
        return { ...this.status };
    }
};
exports.SimulationService = SimulationService;
exports.SimulationService = SimulationService = SimulationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [scenario_strategy_1.ScenarioStrategy])
], SimulationService);
//# sourceMappingURL=simulation.service.js.map