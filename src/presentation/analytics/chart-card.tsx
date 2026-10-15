import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { chartLimit } from '@/domain/analytics';
import { Button } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { ChartLegend, type LegendItem } from './bar-chart';

export type CardView = 'chart' | 'all' | 'table';

// The view of a card lives in the address (?risk=table): a reload keeps it,
// and server-rendered tests see it.
export function useCardView(
  param: string,
): readonly [CardView, (view: CardView) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const view: CardView = raw === 'table' || raw === 'all' ? raw : 'chart';
  const setView = (next: CardView) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'chart') copy.delete(param);
        else copy.set(param, next);
        return copy;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  return [view, setView] as const;
}

export function ChartCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby={`${id}-title`}>
      <Stack gap="1">
        <chakra.h2 id={`${id}-title`} textStyle="heading.h3">
          {title}
        </chakra.h2>
        <Text color="text.secondary">{description}</Text>
      </Stack>
      {children}
    </Card>
  );
}

// The legend of the chart and the switch between the chart and the table.
export function ChartControls({
  legend,
  view,
  onView,
}: {
  legend: readonly LegendItem[];
  view: CardView;
  onView: (view: CardView) => void;
}) {
  return (
    <Flex wrap="wrap" align="center" columnGap="4" rowGap="3">
      {view !== 'table' && <ChartLegend items={legend} />}
      <Button
        variant="secondary"
        ms="auto"
        onClick={() => {
          onView(view === 'table' ? 'chart' : 'table');
        }}
      >
        {view === 'table' ? 'Показать графиком' : 'Показать таблицей'}
      </Button>
    </Flex>
  );
}

// A long chart shows its first ten rows until «Показать все».
export function visibleRows<T>(
  rows: readonly T[],
  view: CardView,
): readonly T[] {
  return view === 'all' ? rows : rows.slice(0, chartLimit);
}

export function MoreRows({
  total,
  view,
  onView,
}: {
  total: number;
  view: CardView;
  onView: (view: CardView) => void;
}) {
  if (total <= chartLimit || view === 'table') return null;
  return (
    <Button
      variant="secondary"
      alignSelf="flex-start"
      onClick={() => {
        onView(view === 'all' ? 'chart' : 'all');
      }}
    >
      {view === 'all' ? 'Свернуть' : `Показать все (${String(total)})`}
    </Button>
  );
}
