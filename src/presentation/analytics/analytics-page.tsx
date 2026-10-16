import { Stack } from '@chakra-ui/react';
import type { BusinessContext, Envelope } from '@/application/api';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { warehouseStamp } from '@/presentation/warehouse/warehouse-read';
import { FlowCard } from './flow-card';
import { RiskCard } from './risk-card';
import { SupplyCard } from './supply-card';
import { AnalyticsTiles } from './tiles';
import { useMovementQuery } from './week';

// The stamp names the oldest data on the page.
const oldest = (contexts: readonly (BusinessContext | undefined)[]) =>
  contexts.reduce<BusinessContext | undefined>(
    (min, context) =>
      context !== undefined &&
      (min === undefined ||
        context.evaluatedAt.epochMs < min.evaluatedAt.epochMs)
        ? context
        : min,
    undefined,
  );

export function AnalyticsPage() {
  const data = useRestaurantData();
  const caption = useSectionDate();
  const query = useMovementQuery();
  const stop = data.stopList();
  const pending = data.pendingWriteoffs();
  const expiring = data.expiringBatches();
  const supply = data.supplySuggestions();
  const stock = data.inventory();
  const flow = query === undefined ? undefined : data.movementReport(query);
  const stamp = warehouseStamp(
    oldest([
      useReadModel(stop).value?.context,
      useReadModel(pending).value?.context,
      useReadModel(expiring).value?.context,
      useReadModel(supply).value?.context,
      useReadModel(stock).value?.context,
      useReadModel<Envelope<unknown>>(flow ?? stock).value?.context,
    ]),
  );
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader title="Аналитика" caption={caption} />
      <EvaluationStamp
        text={stamp}
        onRefresh={() => {
          for (const model of [stop, pending, expiring, supply, stock])
            model.refresh();
          flow?.refresh();
        }}
      />
      <AnalyticsTiles stop={stop} pending={pending} expiring={expiring} />
      <SupplyCard />
      <RiskCard />
      <FlowCard />
    </Stack>
  );
}
