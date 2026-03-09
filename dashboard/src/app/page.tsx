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
        <div className="mx-auto grid max-w-[100rem] w-full gap-6">
          {/* Main: Preset-based Deployment Center */}
          <section className="rounded-lg border-2 border-emerald-500/30 bg-gray-900/30 p-4">
            <ControlPanel />
          </section>

          {/* Sub: Custom Scenario Builder & Active List */}
          <section className="space-y-4 opacity-90">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Custom scenarios (advanced)
            </p>
            <ScenarioBuilder />
            <ScenarioList />
          </section>

          {/* Metrics + Pipeline (left) | Ranking (right, fixed height) */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_500px] lg:grid-rows-[auto_1fr]">
            <div className="min-h-[280px]">
              <MetricsPanel />
            </div>
            <div className="grid min-h-[240px] grid-cols-2 divide-x divide-gray-600 overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50">
              <div className="flex flex-col p-4">
                <PipelineStatusPanel embedded />
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden p-4">
                <LiveEventStream embedded />
              </div>
            </div>
            <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 h-[600px] shrink-0">
              <RankingPanel />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
