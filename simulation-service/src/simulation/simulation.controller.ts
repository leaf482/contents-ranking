import { Body, Controller, Get, Post } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';

@Controller('v1/simulation')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post('start')
  start(@Body() scenario: SimulationScenario): SimulationStatus {
    return this.simulationService.start(scenario);
  }

  @Post('stop')
  stop(): SimulationStatus {
    return this.simulationService.stop();
  }

  @Get('status')
  status(): SimulationStatus {
    return this.simulationService.getStatus();
  }
}
