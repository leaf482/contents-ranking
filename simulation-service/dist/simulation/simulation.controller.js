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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationController = void 0;
const common_1 = require("@nestjs/common");
const simulation_service_1 = require("./simulation.service");
const scenario_interface_1 = require("./interfaces/scenario.interface");
let SimulationController = class SimulationController {
    simulationService;
    constructor(simulationService) {
        this.simulationService = simulationService;
    }
    start(scenario) {
        return this.simulationService.start(scenario);
    }
    stop() {
        return this.simulationService.stop();
    }
    status() {
        return this.simulationService.getStatus();
    }
};
exports.SimulationController = SimulationController;
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [scenario_interface_1.SimulationScenario]),
    __metadata("design:returntype", scenario_interface_1.SimulationStatus)
], SimulationController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('stop'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", scenario_interface_1.SimulationStatus)
], SimulationController.prototype, "stop", null);
__decorate([
    (0, common_1.Get)('status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", scenario_interface_1.SimulationStatus)
], SimulationController.prototype, "status", null);
exports.SimulationController = SimulationController = __decorate([
    (0, common_1.Controller)('v1/simulation'),
    __metadata("design:paramtypes", [simulation_service_1.SimulationService])
], SimulationController);
//# sourceMappingURL=simulation.controller.js.map