import { Stack } from '@chakra-ui/react';
import type { BusinessContext } from '@/application/api';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { warehouseStamp } from '@/presentation/warehouse/warehouse-read';
import { SupplyCard } from './supply-card';
import { AnalyticsTiles } from './tiles';
import { useAnalyticsWeek } from './week';

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
  const week = useAnalyticsWeek();
  const stop = data.stopList();
  const pending = data.pendingWriteoffs();
  const expiring = data.expiringBatches();
  const supply = data.supplySuggestions();
  const stock = data.inventory();
  const flow = data.movementReport(week);
  const stamp = warehouseStamp(
    oldest([
      useReadModel(stop).value?.context,
      useReadModel(pending).value?.context,
      useReadModel(expiring).value?.context,
      useReadModel(supply).value?.context,
      useReadModel(stock).value?.context,
      useReadModel(flow).value?.context,
    ]),
  );
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader title="Аналитика" caption={caption} />
      <EvaluationStamp
        text={stamp}
        onRefresh={() => {
          for (const model of [stop, pending, expiring, supply, stock, flow])
            model.refresh();
        }}
      />
      <AnalyticsTiles stop={stop} pending={pending} expiring={expiring} />
      <SupplyCard />
    </Stack>
  );
}
