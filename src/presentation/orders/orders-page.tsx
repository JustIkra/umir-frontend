import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { OrderFlow } from '@/application/order-flow';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { useServices } from '@/presentation/services';
import {
  useAccess,
  useReadModel,
  useRestaurantData,
  useStore,
} from '@/presentation/session/hooks';
import { media } from '@/presentation/theme/system';
import { Button } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { rem } from '@/presentation/ui/units';
import { MenuTabs } from './menu-tabs';
import { draftSummary } from './order-messages';
import {
  AttemptOrder,
  DraftOrder,
  EmptyOrder,
  OutcomeOrder,
  PlacedOrder,
  ProposalOrder,
} from './order-panel';
import { productMap } from './order-rows';
import { ShortageDialog } from './shortage-dialog';

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

// Figma 01/02-390 order bar at the bottom of the menu: the order summary and
// «К составу», disabled while the order is empty.
function OrderBar({
  summary,
  openRef,
  onOpen,
}: {
  summary: string | undefined;
  openRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  return (
    <Flex
      display={{ base: 'flex', sm: 'none' }}
      position="sticky"
      bottom="0"
      zIndex="1"
      align="center"
      justify="space-between"
      gap="3"
      mx="-4"
      px="4"
      py="3"
      bg="bg.surface"
      borderTopWidth="1px"
      borderColor="border.default"
    >
      <Stack gap="0">
        <Text textStyle="body.strong">{summary ?? 'Заказ пуст'}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {summary === undefined ? 'Добавьте блюда из меню' : 'не проверен'}
        </Text>
      </Stack>
      <Button ref={openRef} disabled={summary === undefined} onClick={onOpen}>
        К составу
      </Button>
    </Flex>
  );
}

// Figma «Новый заказ»: the menu with the order panel at its right from 881
// (320px as in 02 1024, 400px from 1201); on 390 the menu and the order are
// separate views (01/02/03-390, 05-390, 09-390).
export function OrdersPage() {
  const { restaurantID } = useParams();
  const { orderFlow } = useServices();
  const flow = restaurantID === undefined ? undefined : orderFlow(restaurantID);
  return flow === undefined ? null : <OrdersView flow={flow} />;
}

function OrdersView({ flow }: { flow: OrderFlow }) {
  const { restaurantID } = useParams();
  const caption = useSectionDate();
  const snapshot = useStore(flow);
  const { phase } = snapshot;
  const [query, setQuery] = useState('');
  const access = useAccess();
  const restaurant =
    restaurantID === undefined
      ? undefined
      : findRestaurant(access, restaurantID);
  const data = useRestaurantData();
  const menuRead = useReadModel(data.menu());
  const stopRead = useReadModel(data.stopList());
  const productsRead = useReadModel(data.servingProducts());
  const timeZone =
    restaurant?.timeZone ?? menuRead.value?.context.settings.timeZone ?? 'UTC';
  const names = new Map<string, string>([
    ...(stopRead.value?.result.dishes ?? []).map((dish): [string, string] => [
      dish.dishID,
      dish.name,
    ]),
    ...(menuRead.value?.result.dishes ?? []).map((dish): [string, string] => [
      dish.dishID,
      dish.name,
    ]),
  ]);
  const products = productMap(productsRead.value?.result.items ?? []);
  const dialog = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // On 390 the pressed button disappears with its view, so focus moves to
  // the control that leads back.
  const showOrder = (show: boolean) => {
    flushSync(() => {
      setOrderView(show);
    });
    (show ? backButton : openButton).current?.focus();
  };
  // Every phase but the draft lives in the order view; a restored attempt
  // opens it with the page.
  const [orderView, setOrderView] = useState(phase.kind !== 'compose');
  if (phase.kind !== 'compose' && !orderView) setOrderView(true);
  const composing = phase.kind === 'compose';
  const summary =
    snapshot.draft.length === 0 ? undefined : draftSummary(snapshot.draft);
  const edit = () => {
    flow.editAgain();
  };
  const shortage =
    (phase.kind === 'proposal' || phase.kind === 'confirming') &&
    phase.proposal.changes.length > 0
      ? { proposal: phase.proposal, previous: phase.previous }
      : phase.kind === 'empty' && phase.proposal !== undefined
        ? { proposal: phase.proposal, previous: undefined }
        : undefined;
  let panel: ReactNode;
  switch (phase.kind) {
    case 'compose':
    case 'preparing':
      panel =
        snapshot.draft.length === 0 ? (
          <EmptyOrder />
        ) : (
          <DraftOrder
            snapshot={snapshot}
            names={names}
            onPortions={(lineNo, portions) => {
              flow.setPortions(lineNo, portions);
            }}
            onRemove={(lineNo) => {
              flow.remove(lineNo);
            }}
            onPrepare={() => {
              void flow.prepare();
            }}
          />
        );
      break;
    case 'proposal':
    case 'confirming':
      panel = (
        <ProposalOrder
          proposal={phase.proposal}
          names={names}
          timeZone={timeZone}
          confirming={phase.kind === 'confirming'}
          confirmRef={confirmButton}
          onConfirm={() => {
            if (phase.proposal.changes.length > 0) {
              dialog.current?.showModal();
            } else {
              void flow.confirm();
            }
          }}
          onEdit={edit}
        />
      );
      break;
    case 'confirmed':
      panel = (
        <PlacedOrder
          order={phase.order}
          names={names}
          timeZone={timeZone}
          onNew={edit}
        />
      );
      break;
    case 'unknown':
    case 'pending':
    case 'conflict':
      panel = (
        <AttemptOrder
          phase={phase}
          names={names}
          timeZone={timeZone}
          notice={snapshot.notice}
          onCheck={() => {
            void flow.check();
          }}
        />
      );
      break;
    case 'not-found':
    case 'refused':
    case 'reset':
    case 'superseded':
    case 'empty':
      panel = (
        <OutcomeOrder
          phase={phase}
          names={names}
          timeZone={timeZone}
          onPrepareAgain={() => {
            void flow.restart();
          }}
          onEdit={edit}
          onRetry={() => {
            void flow.confirm();
          }}
          onOpenReplacement={() => {
            flow.openReplacement();
          }}
        />
      );
      break;
  }
  const back = composing ? (
    <Button
      ref={backButton}
      variant="link"
      alignSelf="flex-start"
      onClick={() => {
        showOrder(false);
      }}
    >
      ← Вернуться к меню
    </Button>
  ) : undefined;
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      {/* On 390 the order view hides the title from sight, not from the
          page outline. */}
      <Box css={orderView ? { [media.belowSm]: visuallyHidden } : undefined}>
        <PageHeader title="Новый заказ" caption={caption} />
      </Box>
      <Grid
        templateColumns={{
          base: '1fr',
          md: `minmax(0, 1fr) ${rem(320)}`,
          xl: `minmax(0, 1fr) ${rem(400)}`,
        }}
        gap="6"
        alignItems="start"
      >
        <Stack
          gap={{ base: '4', sm: '5' }}
          display={{ base: orderView ? 'none' : 'flex', sm: 'flex' }}
          minW="0"
        >
          <SearchInput
            label="Найти блюдо"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <MenuTabs
            draft={snapshot.draft}
            query={query}
            canAdd={composing}
            onAdd={(dishID) => {
              flow.add(dishID);
            }}
            timeZone={timeZone}
          />
          {composing && (
            <OrderBar
              summary={summary}
              openRef={openButton}
              onOpen={() => {
                showOrder(true);
              }}
            />
          )}
        </Stack>
        <Stack
          gap="5"
          display={{ base: orderView ? 'flex' : 'none', sm: 'flex' }}
          position={{ md: 'sticky' }}
          top={{ md: '6' }}
        >
          {orderView && back !== undefined && (
            <Box display={{ base: 'block', sm: 'none' }}>{back}</Box>
          )}
          {panel}
        </Stack>
      </Grid>
      {shortage !== undefined && (
        <ShortageDialog
          dialogRef={dialog}
          returnFocusRef={confirmButton}
          proposal={shortage.proposal}
          previous={shortage.previous}
          names={names}
          products={products}
          timeZone={timeZone}
          confirming={phase.kind === 'confirming'}
          onConfirm={() => {
            void flow.confirm();
          }}
          onEdit={edit}
        />
      )}
    </Stack>
  );
}
