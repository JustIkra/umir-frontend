import { Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useParams, useSearchParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { Envelope } from '@/application/api';
import type { ScreenFailure } from '@/application/failure';
import type { ReadModel, ReadModelSnapshot } from '@/application/read-model';
import type { StockReport } from '@/application/warehouse';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import { useServices } from '@/presentation/services';
import {
  useAccess,
  usePermissions,
  useReadModel,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { formatInstant } from '@/presentation/ui/time';
import { rem } from '@/presentation/ui/units';
import { formatStamp, zoneLabel } from '@/presentation/ui/zones';
import {
  batchCountText,
  batchRows,
  boundaryError,
  boundaryText,
  customHoursOf,
  customRiskHours,
  isCursorExpired,
  mergePages,
  productCountText,
  reportRows,
  settingsRetry,
  windowHours,
  windowOf,
  zonedEpochMs,
  type ExpiryWindow,
} from './expiry-rows';
import { WarehouseLayout } from './warehouse-layout';
import { WriteoffPanel } from './writeoff-panel';

const daySeconds = 86_400n;
const noCursors: readonly string[] = [];
const options: readonly { value: ExpiryWindow; title: string }[] = [
  { value: '24h', title: '24 ч' },
  { value: '3d', title: '3 дня' },
  { value: '7d', title: '7 дней' },
  { value: 'custom', title: 'Своя граница' },
];

const stampOf = (read: Envelope<unknown> | undefined) =>
  read === undefined
    ? 'Получаем новую оценку…'
    : `Оценка ${formatStamp(read.context.evaluatedAt.epochMs, read.context.settings.timeZone)}`;

// The catalog names of the products; batches and reports carry only codes.
function useProductNames(): ReadonlyMap<string, string> {
  const data = useRestaurantData();
  const items = useReadModel(data.products()).value?.result.items ?? [];
  return new Map(items.map((product) => [product.productID, product.name]));
}

// The zone of the organization from access, as in the section header.
function useAccessZone(): string | undefined {
  const { restaurantID } = useParams();
  const access = useAccess();
  return restaurantID === undefined
    ? undefined
    : findRestaurant(access, restaurantID)?.timeZone;
}

// One store over the page models: the snapshot list changes only when a
// page changes, as useSyncExternalStore requires.
function combineReads<T>(models: readonly ReadModel<T>[]) {
  let cached: readonly ReadModelSnapshot<T>[] = [];
  return {
    subscribe: (listener: () => void) => {
      const stops = models.map((model) => model.subscribe(listener));
      return () => {
        for (const stop of stops) stop();
      };
    },
    getSnapshot: () => {
      const next = models.map((model) => model.getSnapshot());
      if (
        next.length !== cached.length ||
        next.some((item, index) => item !== cached[index])
      )
        cached = next;
      return cached;
    },
  };
}

// The pages read by «Показать ещё»: one subscription for all of them.
function useReadModels<T>(
  models: readonly ReadModel<T>[],
): readonly ReadModelSnapshot<T>[] {
  const store = useMemo(() => combineReads(models), [models]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

function SkeletonRows() {
  return Array.from({ length: 4 }, (_, index) => (
    <Flex
      as="li"
      key={index}
      aria-hidden="true"
      justify="space-between"
      gap="4"
      px="4"
      py="3"
      borderTopWidth={index === 0 ? '0' : '1px'}
      borderColor="border.default"
    >
      <Skeleton h="5" w="50%" />
      <Skeleton h="5" w="20%" />
    </Flex>
  ));
}

// S9: the window answered with nothing to show.
function EmptyWindow({ title, text }: { title: string; text: string }) {
  return (
    <Stack as="li" align="center" gap="1" px="4" py="8" textAlign="center">
      <Text textStyle="body.strong">{title}</Text>
      <Text textStyle="body.default" color="text.secondary">
        {text}
      </Text>
    </Stack>
  );
}

function Summary({ children }: { children: string }) {
  return (
    <Text
      as="li"
      display={{ base: 'none', sm: 'block' }}
      px="4"
      py="3"
      textStyle="caption.default"
      color="text.secondary"
      borderBottomWidth="1px"
      borderColor="border.default"
    >
      {children}
    </Text>
  );
}

const failedText =
  'Склад сейчас не ответил. Это не пустое окно: повторите чтение.';

// A refused read of the window, as S6: «Повторить»; the access states and
// the session check come from ReadFailure.
function WindowFailure({
  failure,
  onRetry,
}: {
  failure: ScreenFailure;
  onRetry: () => void;
}) {
  if (failure.kind === 'unavailable' || failure.kind === 'error') {
    return (
      <FormMessage
        tone="error"
        title="Не удалось получить сроки годности"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        }
      >
        {failedText}
      </FormMessage>
    );
  }
  return (
    <ReadFailure
      failure={failure}
      section="Склад"
      title="Не удалось получить сроки годности"
      onRetry={onRetry}
    >
      {failedText}
    </ReadFailure>
  );
}

// An older answer stays on screen when a re-read fails (as S8).
function StaleWindow({
  read,
  onRetry,
}: {
  read: Envelope<unknown>;
  onRetry: () => void;
}) {
  return (
    <FormMessage
      tone="unknown"
      title={`Показаны данные на ${formatStamp(read.context.evaluatedAt.epochMs, read.context.settings.timeZone)}.`}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      }
    >
      Новая оценка не получена — значения могут быть устаревшими.
    </FormMessage>
  );
}

// Window 24 h: the batches of expiring-batches with at most 24 h left.
function BatchWindow({
  controls,
  onRefresh,
  children,
}: {
  controls: (boundary: string | undefined) => ReactNode;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const data = useRestaurantData();
  const model = data.expiringBatches();
  const { snapshot, failure } = useRestaurantRead(model);
  const names = useProductNames();
  const value = snapshot.value;
  const refresh = () => {
    model.refresh();
  };
  const timeZone = value?.context.settings.timeZone ?? 'UTC';
  const rows =
    value === undefined ? [] : batchRows(value.result, names, daySeconds);
  return (
    <WarehouseLayout
      section="Сроки годности"
      stamp={stampOf(value)}
      onRefresh={() => {
        refresh();
        onRefresh();
      }}
    >
      {controls(
        value === undefined
          ? undefined
          : boundaryText(
              value.result.evaluatedAt.epochMs + 86_400_000,
              timeZone,
            ),
      )}
      {value !== undefined && failure !== undefined && (
        <StaleWindow read={value} onRetry={refresh} />
      )}
      {value === undefined && failure !== undefined ? (
        <WindowFailure failure={failure} onRetry={refresh} />
      ) : (
        <ListCard p="0" overflow="hidden">
          {value === undefined && <SkeletonRows />}
          {value !== undefined && rows.length === 0 && (
            <EmptyWindow
              title="В окне нет партий"
              text="До границы не истекает ни одна партия с остатком."
            />
          )}
          {rows.length > 0 && (
            <>
              <Summary>{batchCountText(rows.length)}</Summary>
              <Flex
                as="li"
                aria-hidden="true"
                display={{ base: 'none', sm: 'flex' }}
                justify="space-between"
                px="4"
                py="calc({spacing.2} - 0.5px)"
                bg="bg.canvas"
                borderBottomWidth="1px"
                borderColor="border.default"
                textStyle="caption.strong"
                color="text.secondary"
              >
                <span>Продукт и партия</span>
                <span>Осталось по сроку</span>
              </Flex>
            </>
          )}
          {rows.map((row, index) => (
            <Flex
              as="li"
              key={row.batchID}
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'stretch', sm: 'center' }}
              justify="space-between"
              gap={{ base: '1', sm: '4' }}
              px="4"
              py="3"
              borderTopWidth={index === 0 ? '0' : '1px'}
              borderColor="border.default"
            >
              <Stack gap="0.5" minW="0">
                <Text textStyle="body.strong">{row.product}</Text>
                <Text textStyle="caption.default" color="text.secondary">
                  {`Партия ${row.batchID} · остаток ${row.quantity}`}
                </Text>
              </Stack>
              <Flex
                direction={{ base: 'row', sm: 'column' }}
                align={{ base: 'center', sm: 'flex-end' }}
                gap={{ base: '2', sm: '1' }}
                flexShrink="0"
              >
                <Badge tone="expiry">{row.remaining}</Badge>
                <Text textStyle="caption.default" color="text.secondary">
                  {`до ${formatInstant(row.expiresAt.epochMs, timeZone, 'dateTime')}`}
                </Text>
              </Flex>
            </Flex>
          ))}
        </ListCard>
      )}
      {children}
    </WarehouseLayout>
  );
}

// «Своя граница»: a date and time in the zone of the organization, turned
// into whole hours when it changes.
function BoundaryField({
  timeZone,
  onHours,
}: {
  timeZone: string;
  onHours: (hours: number) => void;
}) {
  const { now } = useServices();
  const [text, setText] = useState('');
  const id = useId();
  const errorId = useId();
  const hoursOf = (value: string) => {
    const epochMs = zonedEpochMs(value, timeZone);
    return epochMs === undefined
      ? 'out-of-range'
      : customRiskHours(epochMs, now());
  };
  const error =
    text !== '' && hoursOf(text) === 'out-of-range' ? boundaryError : undefined;
  return (
    <FieldGroup>
      <FieldLabel htmlFor={id}>
        {`Дата и время границы (${zoneLabel(timeZone, now())})`}
      </FieldLabel>
      <TextInput
        id={id}
        type="datetime-local"
        value={text}
        invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        w={{ sm: rem(240) }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const hours = next === '' ? 'out-of-range' : hoursOf(next);
          if (hours !== 'out-of-range') onHours(hours);
        }}
      />
      <FieldMessage id={errorId} error={error} />
    </FieldGroup>
  );
}

// Windows 3 d, 7 d and «Своя граница»: products of analytics/stock with
// riskHours; «Показать ещё» reads the pages after the first.
function ReportWindow({
  controls,
  riskHours,
  custom,
  onHours,
  onRefresh,
  children,
}: {
  controls: (boundary: string | undefined) => ReactNode;
  riskHours: number;
  custom: boolean;
  onHours: (hours: number) => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const { access } = useServices();
  const data = useRestaurantData();
  const accessZone = useAccessZone();
  const first = data.stockReport(riskHours);
  const { snapshot, failure } = useRestaurantRead(first);
  const [retried, setRetried] = useState<{
    readonly model: ReadModel<Envelope<StockReport>>;
    readonly loadedAt: number | undefined;
  }>();
  const retry = settingsRetry(
    snapshot,
    retried?.model === first ? retried : undefined,
  );
  const loadedAt = snapshot.loadedAt;
  useEffect(() => {
    if (retry !== 'due') return;
    let live = true;
    const repeat = () => {
      if (!live) return;
      setRetried({ model: first, loadedAt });
      first.refresh();
    };
    void access.refresh().then(repeat, repeat);
    return () => {
      live = false;
    };
  }, [retry, first, access, loadedAt]);
  const [more, setMore] = useState<{
    readonly model: ReadModel<Envelope<StockReport>>;
    readonly cursors: readonly string[];
  }>();
  const cursors = more?.model === first ? more.cursors : noCursors;
  const pageModels = useMemo(
    () => cursors.map((cursor) => data.stockReportPage(riskHours, cursor)),
    [data, riskHours, cursors],
  );
  const pageReads = useReadModels(pageModels);
  const expiredAt = pageReads.findIndex(
    (read) => read.failed && isCursorExpired(read.failure),
  );
  // A page behind an expired cursor and the pages after it are dropped; the
  // first page is read again for a fresh cursor.
  useEffect(() => {
    if (expiredAt !== -1) first.refresh();
  }, [expiredAt, first]);
  const shown = expiredAt === -1 ? pageReads : pageReads.slice(0, expiredAt);
  const value = snapshot.value;
  const tail = shown.at(-1);
  const nextCursor =
    tail === undefined
      ? value?.result.nextCursor
      : tail.value?.result.nextCursor;
  const refresh = () => {
    setRetried(undefined);
    first.refresh();
  };
  const showMore = () => {
    if (tail?.failed === true) {
      pageModels[shown.length - 1]?.refresh();
      return;
    }
    if (nextCursor === undefined) return;
    setMore({
      model: first,
      cursors: [...cursors.slice(0, shown.length), nextCursor],
    });
  };
  const settling = retry === 'due' || retry === 'waiting';
  const shownFailure = settling ? undefined : failure;
  // A refused first read, or a SettingsChanged of the repeat: the error
  // state; any other refused re-read keeps the older answer.
  const broken =
    shownFailure !== undefined && (value === undefined || retry === 'failed');
  const loading = value === undefined || settling;
  const rows = loading
    ? []
    : reportRows(
        mergePages(
          value.result,
          shown.flatMap((read) =>
            read.value === undefined ? [] : [read.value.result],
          ),
        ),
      );
  const moreShown =
    value !== undefined &&
    (tail === undefined
      ? nextCursor !== undefined
      : tail.loading || tail.failed || nextCursor !== undefined);
  const timeZone = value?.context.settings.timeZone ?? accessZone ?? 'UTC';
  return (
    <WarehouseLayout
      section="Сроки годности"
      stamp={stampOf(settling ? undefined : value)}
      onRefresh={() => {
        refresh();
        onRefresh();
      }}
    >
      {controls(
        loading
          ? undefined
          : boundaryText(value.result.riskCutoff.epochMs, timeZone),
      )}
      {custom && (
        <BoundaryField timeZone={accessZone ?? timeZone} onHours={onHours} />
      )}
      {shownFailure !== undefined && broken && (
        <WindowFailure failure={shownFailure} onRetry={refresh} />
      )}
      {shownFailure !== undefined && !broken && value !== undefined && (
        <StaleWindow read={value} onRetry={refresh} />
      )}
      {!broken && (
        <Stack gap="2">
          <ListCard p="0" overflow="hidden">
            {loading && <SkeletonRows />}
            {!loading && rows.length === 0 && !moreShown && (
              <EmptyWindow
                title="До границы ничего не истекает"
                text="Ни у одного продукта нет остатка со сроком до границы."
              />
            )}
            {rows.length > 0 && (
              <Summary>{productCountText(rows.length)}</Summary>
            )}
            {rows.map((row, index) => (
              <Flex
                as="li"
                key={row.productID}
                direction={{ base: 'column', sm: 'row' }}
                align={{ base: 'stretch', sm: 'center' }}
                justify="space-between"
                gap={{ base: '1', sm: '4' }}
                px="4"
                py="3"
                borderTopWidth={index === 0 ? '0' : '1px'}
                borderColor="border.default"
              >
                <Text textStyle="body.strong">{row.product}</Text>
                <Text textStyle="caption.default" color="text.secondary">
                  {`истекает ${row.expiring} из ${row.available}`}
                </Text>
              </Flex>
            ))}
          </ListCard>
          {!loading && moreShown && (
            <Button
              variant="secondary"
              alignSelf="flex-start"
              disabled={tail?.loading === true}
              aria-busy={tail?.loading === true ? 'true' : undefined}
              onClick={showMore}
            >
              Показать ещё
            </Button>
          )}
          <Text textStyle="caption.default" color="text.secondary">
            {custom
              ? 'Склад считает границу в целых часах: показана ближайшая граница не раньше введённой.'
              : 'В этом окне склад считает остаток по продуктам, без партий.'}
          </Text>
        </Stack>
      )}
      {children}
    </WarehouseLayout>
  );
}

// Figma S3 «Сроки годности» with the windows of spec 6.1 and «Ожидают
// списания» under the list. The window and the hours of «Своя граница» live
// in the address (?window=, ?hours=); «Обновить» re-reads both blocks.
export function ExpiryPage() {
  const data = useRestaurantData();
  const analytics = usePermissions().has('analytics.read');
  const [params, setParams] = useSearchParams();
  const chosen = windowOf(params.get('window'), analytics);
  const controls = (boundary: string | undefined) => (
    <Flex wrap="wrap" align="center" columnGap="4" rowGap="3">
      <SegmentChoice
        label="Окно сроков"
        options={analytics ? options : options.slice(0, 1)}
        value={chosen}
        onChange={(next) => {
          setParams(next === '24h' ? {} : { window: next }, { replace: true });
        }}
      />
      {boundary !== undefined && <Text textStyle="mono.body">{boundary}</Text>}
    </Flex>
  );
  const refreshPending = () => {
    data.pendingWriteoffs().refresh();
  };
  if (chosen === '24h')
    return (
      <BatchWindow controls={controls} onRefresh={refreshPending}>
        <WriteoffPanel />
      </BatchWindow>
    );
  return (
    <ReportWindow
      controls={controls}
      onRefresh={refreshPending}
      riskHours={
        chosen === 'custom'
          ? customHoursOf(params.get('hours'))
          : windowHours[chosen]
      }
      custom={chosen === 'custom'}
      onHours={(hours) => {
        setParams(
          { window: 'custom', hours: String(hours) },
          { replace: true },
        );
      }}
    >
      <WriteoffPanel />
    </ReportWindow>
  );
}
