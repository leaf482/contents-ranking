import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import * as https from 'https';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { ScenarioStrategy } from './strategies/scenario.strategy';
import { LoadStrategy } from './strategies/load.strategy';

@Module({
  imports: [
    HttpModule.register({
      // keep-alive connection pool — avoids TCP handshake per request
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
    }),
  ],
  controllers: [SimulationController],
  providers: [SimulationService, ScenarioStrategy, LoadStrategy],
})
export class SimulationModule {}
