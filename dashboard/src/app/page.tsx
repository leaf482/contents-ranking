'use client';

import { Header } from '@/components/Header';
import { ControlPanel } from '@/components/ControlPanel';
import { ScenarioBuilder } from '@/components/ScenarioBuilder';
import { ScenarioList } from '@/components/ScenarioList';
import { MetricsPanel } from '@/components/MetricsPanel';
import { RankingPanel } from '@/components/RankingPanel';
import { PipelineStatusPanel } from '@/components/PipelineStatusPanel';
import { LiveEventStream } from '@/components/LiveEventStream';

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <main className="relative flex-1 p-6">
        <div className="fixed bottom-6 left-6 z-10 w-64">
          <LiveEventStream />
        </div>
        <div className="mx-auto grid max-w-[100rem] w-full gap-6">
          {/* Preset Control */}
          <section>
            <ControlPanel />
          </section>

          {/* Scenario Builder & List */}
          <section className="space-y-4">
            <ScenarioBuilder />
            <ScenarioList />
          </section>

          {/* Metrics + Pipeline (left) | Ranking (right, fixed height) */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_500px] lg:grid-rows-[auto_1fr]">
            <div className="min-h-[280px]">
              <MetricsPanel />
            </div>
            <div>
              <PipelineStatusPanel />
            </div>
            <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 h-[590px] shrink-0">
              <RankingPanel />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
