import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import * as https from 'https';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { LoadStrategy } from './strategies/load.strategy';
import { RunManager } from './engine/run-manager';
import { TaskManager } from './engine/task-manager';
import { MasterTickScheduler } from './engine/master-tick-scheduler';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';

@Module({
  imports: [
    HttpModule.register({
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
    }),
  ],
  controllers: [SimulationController, MetricsController],
  providers: [
    SimulationService,
    LoadStrategy,
    RunManager,
    TaskManager,
    MasterTickScheduler,
    MetricsService,
  ],
})
export class SimulationModule {}
