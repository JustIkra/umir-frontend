import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react';
import { useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '@/presentation/app-shell/pages';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { draftOrder } from '@/presentation/placeholder-orders';
import { media } from '@/presentation/theme/system';
import { Button, TextLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { rem } from '@/presentation/ui/units';
import { MenuTabs } from './menu-tabs';
import {
  DraftOrder,
  EmptyOrder,
  PlacedOrder,
  ProposalOrder,
} from './order-panel';
import { ShortageDialog } from './shortage-dialog';

export type OrderStep = 'empty' | 'draft' | 'proposal' | 'placed';

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
  empty,
  openRef,
  onOpen,
}: {
  empty: boolean;
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
        <Text textStyle="body.strong">
          {empty
            ? 'Заказ пуст'
            : `Заказ · ${String(draftOrder.length)} позиций`}
        </Text>
        <Text textStyle="caption.default" color="text.secondary">
          {empty ? 'Добавьте блюда из меню' : '9 порций · не проверен'}
        </Text>
      </Stack>
      <Button ref={openRef} disabled={empty} onClick={onOpen}>
        К составу
      </Button>
    </Flex>
  );
}

// Figma «Новый заказ»: the menu with the order panel at its right from 881
// (320px as in 02 1024, 400px from 1201); on 390 the menu and the order are
// separate views (01/02/03-390, 05-390, 09-390).
export function OrdersPage({ step }: { step: OrderStep }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  // On 390 the pressed button disappears with its view, so focus moves to
  // the control that leads back.
  const showOrder = (show: boolean) => {
    flushSync(() => {
      setOrderView(show);
    });
    (show ? backButton : openButton).current?.focus();
  };
  const [orderView, setOrderView] = useState(
    step === 'proposal' || step === 'placed',
  );
  const panel = {
    empty: <EmptyOrder />,
    draft: <DraftOrder />,
    proposal: (
      <ProposalOrder
        onConfirm={() => {
          dialog.current?.showModal();
        }}
      />
    ),
    placed: <PlacedOrder />,
  }[step];
  const back =
    step === 'draft' ? (
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
    ) : (
      <TextLink
        to={step === 'proposal' ? '/app/orders/draft' : '/app/orders'}
        alignSelf="flex-start"
        mx="1"
      >
        ← Вернуться к меню
      </TextLink>
    );
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      {/* On 390 the order view hides the title from sight, not from the
          page outline. */}
      <Box css={orderView ? { [media.belowSm]: visuallyHidden } : undefined}>
        <PageHeader title="Новый заказ" caption={placeholderAccount.today} />
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
          <SearchInput label="Найти блюдо" />
          <MenuTabs draft={step === 'draft'} />
          {(step === 'empty' || step === 'draft') && (
            <OrderBar
              empty={step === 'empty'}
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
          {orderView && (
            <Box display={{ base: 'block', sm: 'none' }}>{back}</Box>
          )}
          {panel}
        </Stack>
      </Grid>
      {step === 'proposal' && <ShortageDialog dialogRef={dialog} />}
    </Stack>
  );
}
