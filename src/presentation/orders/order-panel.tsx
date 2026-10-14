import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode, RefObject } from 'react';
import type { OrderPhase, OrderSnapshot } from '@/application/order-flow';
import type { Order, OrderProposal, Position } from '@/application/restaurant';
import {
  portionsValid,
  type Draft,
  type DraftLine,
} from '@/domain/order-draft';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import { Button, TextLink } from '@/presentation/ui/actions';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon } from '@/presentation/ui/icon';
import { Stepper } from '@/presentation/ui/stepper';
import {
  attemptMessage,
  compositionText,
  confirmedLines,
  draftSummary,
  finalText,
  noticeMessage,
  outcomeMessage,
  portionsText,
} from './order-messages';
import { evaluationText } from './order-rows';

// Figma Order panel 85:1135: header, body, a grey footer with the action.
function Panel({
  header,
  children,
  footer,
}: {
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Stack
      as="section"
      aria-label="Заказ"
      gap="0"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
      overflow="hidden"
    >
      <Box px="5" py="4" borderBottomWidth="1px" borderColor="border.default">
        {header}
      </Box>
      <Box px="5" py="2">
        {children}
      </Box>
      <Stack
        gap="3"
        px="5"
        py="4"
        bg="bg.canvas"
        borderTopWidth="1px"
        borderColor="border.default"
      >
        {footer}
      </Stack>
    </Stack>
  );
}

function Heading({
  title,
  caption,
}: {
  title: string;
  caption?: string | undefined;
}) {
  return (
    <Stack gap="0.5">
      <chakra.h2 textStyle="heading.h3">{title}</chakra.h2>
      {caption !== undefined && (
        <Text textStyle="caption.default" color="text.secondary">
          {caption}
        </Text>
      )}
    </Stack>
  );
}

const PositionMark = chakra('span', {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
    minW: '6',
    h: '6',
    px: '1',
    borderRadius: 'sm',
    bg: 'bg.subtle',
    textStyle: 'caption.default',
  },
});

const divider = {
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  _last: { borderBottomWidth: '0' },
} as const;

export function EmptyOrder() {
  return (
    <Panel
      header={
        <Heading title="Состав заказа" caption="Позиции в порядке добавления" />
      }
      footer={
        <>
          <Button disabled w="full">
            Подготовить заказ
          </Button>
          <Text textStyle="caption.default" color="text.secondary">
            Добавьте хотя бы одно блюдо, чтобы проверить заказ.
          </Text>
        </>
      }
    >
      <Stack align="center" gap="2" py="6" textAlign="center">
        <Flex
          boxSize="12"
          align="center"
          justify="center"
          borderRadius="full"
          bg="bg.subtle"
        >
          <Icon src={ordersIcon} size={24} />
        </Flex>
        <Text textStyle="body.strong">Заказ пуст</Text>
        <Text textStyle="caption.default" color="text.secondary">
          Добавьте блюда из меню — каждое добавление создаёт позицию с 1
          порцией.
        </Text>
      </Stack>
    </Panel>
  );
}

// The first earlier line with the same dish: «Повтор блюда из поз. N».
function repeatOf(draft: Draft, line: DraftLine): number | undefined {
  return draft.find(
    (other) => other.lineNo < line.lineNo && other.dishID === line.dishID,
  )?.lineNo;
}

type Names = ReadonlyMap<string, string>;

const nameOf = (names: Names, dishID: string) => names.get(dishID) ?? dishID;

// The positions of a proposal, an attempt or a placed order: «1 · Борщ» and
// the portions at the right.
function PositionList({
  positions,
  names,
}: {
  positions: readonly Position[];
  names: Names;
}) {
  return (
    <Stack as="ol" gap="0" listStyleType="none">
      {positions.map((position) => (
        <Flex
          as="li"
          key={position.lineNo}
          align="center"
          justify="space-between"
          gap="3"
          py="1.5"
          {...divider}
        >
          <Text textStyle="body.default">
            {position.lineNo} · {nameOf(names, position.dishID)}
          </Text>
          <Text textStyle="mono.body" flexShrink="0" whiteSpace="nowrap">
            {portionsText(position.portions)}
          </Text>
        </Flex>
      ))}
    </Stack>
  );
}

// Figma 02, 03 and E11: the draft. While the order is being checked the
// positions are closed.
export function DraftOrder({
  snapshot,
  names,
  onPortions,
  onRemove,
  onPrepare,
}: {
  snapshot: OrderSnapshot;
  names: Names;
  onPortions: (lineNo: number, portions: string) => void;
  onRemove: (lineNo: number) => void;
  onPrepare: () => void;
}) {
  const preparing = snapshot.phase.kind === 'preparing';
  const notice = snapshot.notice;
  const flagged = notice?.kind === 'portions' ? notice.lines : [];
  const message = notice === undefined ? undefined : noticeMessage(notice);
  return (
    <Panel
      header={
        <Heading title="Состав заказа" caption={draftSummary(snapshot.draft)} />
      }
      footer={
        <>
          {message !== undefined && (
            <FormMessage tone={message.tone} title={message.title}>
              {message.text}
            </FormMessage>
          )}
          <Text textStyle="caption.default" color="text.secondary">
            {preparing
              ? 'Пока идёт проверка, состав не меняется.'
              : 'Проверка учитывает весь заказ: у блюд бывают общие ингредиенты. Продукты не резервируются.'}
          </Text>
          <Button
            w="full"
            disabled={preparing}
            aria-busy={preparing ? 'true' : undefined}
            onClick={onPrepare}
          >
            {preparing ? 'Проверяем заказ…' : 'Подготовить заказ'}
          </Button>
        </>
      }
    >
      <Stack as="ol" gap="0" listStyleType="none">
        {snapshot.draft.map((line) => (
          <Stack as="li" key={line.lineNo} gap="2" py="3" {...divider}>
            <Flex align="flex-start" gap="4">
              <PositionMark>{line.lineNo}</PositionMark>
              <Stack gap="0.5" flex="1" minW="0">
                <Text textStyle="body.default">
                  {nameOf(names, line.dishID)}
                </Text>
                {repeatOf(snapshot.draft, line) !== undefined && (
                  <Text textStyle="caption.default" color="text.secondary">
                    Повтор блюда из поз. {repeatOf(snapshot.draft, line)} —
                    отдельная позиция
                  </Text>
                )}
              </Stack>
              <chakra.button
                type="button"
                boxSize="8"
                display="flex"
                flexShrink="0"
                alignItems="center"
                justifyContent="center"
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: 'bg.subtle' }}
                _disabled={{ cursor: 'not-allowed', opacity: '0.5' }}
                disabled={preparing}
                aria-label={`Удалить позицию ${String(line.lineNo)}`}
                onClick={() => {
                  onRemove(line.lineNo);
                }}
              >
                <Icon src={trashIcon} size={20} />
              </chakra.button>
            </Flex>
            <Box ps="10">
              <Stepper
                value={line.portions}
                label={`позиция ${String(line.lineNo)}`}
                invalid={
                  flagged.includes(line.lineNo) || !portionsValid(line.portions)
                }
                disabled={preparing}
                onChange={(portions) => {
                  onPortions(line.lineNo, portions);
                }}
              />
            </Box>
          </Stack>
        ))}
      </Stack>
    </Panel>
  );
}

// Figma B2, B3 and 04 under the dialog: the proposal. With reductions the
// confirmation goes through the shortage dialog.
export function ProposalOrder({
  proposal,
  names,
  timeZone,
  confirming,
  confirmRef,
  onConfirm,
  onEdit,
}: {
  proposal: OrderProposal;
  names: Names;
  timeZone: string;
  confirming: boolean;
  confirmRef?: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const reduced = proposal.changes.length > 0;
  return (
    <Panel
      header={
        <Heading
          title={confirming ? 'Оформление заказа' : 'Предложение заказа'}
          caption={
            confirming
              ? 'Отправляем подтверждение…'
              : evaluationText(proposal.evaluatedAt.epochMs, timeZone)
          }
        />
      }
      footer={
        <>
          <Text textStyle="caption.strong">
            {confirming
              ? `Подтверждённый состав · ${compositionText(proposal.acceptedPositions)}`
              : finalText(proposal)}
          </Text>
          {!reduced && !confirming && (
            <Text textStyle="caption.default" color="text.secondary">
              Все позиции доступны. Заказ оформится только после подтверждения.
            </Text>
          )}
          {confirming && (
            <Text textStyle="caption.default" color="text.secondary">
              Ждём ответ сервиса. Повторное нажатие не создаст вторую продажу.
            </Text>
          )}
          <Button
            ref={confirmRef}
            w="full"
            disabled={confirming}
            aria-busy={confirming ? 'true' : undefined}
            aria-haspopup={reduced ? 'dialog' : undefined}
            onClick={onConfirm}
          >
            {confirming
              ? 'Отправляем подтверждение…'
              : reduced
                ? 'Проверить и подтвердить'
                : 'Подтвердить состав'}
          </Button>
          <Button
            variant="secondary"
            w="full"
            disabled={confirming}
            onClick={onEdit}
          >
            {reduced ? 'Вернуться к изменению заказа' : 'Изменить заказ'}
          </Button>
        </>
      }
    >
      <PositionList positions={proposal.acceptedPositions} names={names} />
    </Panel>
  );
}

// Figma D2, D3, D4 and F5: an attempt whose outcome is not known. The order
// is closed until the attempt has a result.
export function AttemptOrder({
  phase,
  names,
  timeZone,
  notice,
  onCheck,
}: {
  phase: Extract<OrderPhase, { kind: 'unknown' | 'pending' | 'conflict' }>;
  names: Names;
  timeZone: string;
  notice: OrderSnapshot['notice'];
  onCheck: () => void;
}) {
  const message = attemptMessage(phase, timeZone);
  const failed =
    notice?.kind === 'check-failed' ? noticeMessage(notice) : undefined;
  const { attempt } = phase;
  return (
    <Panel
      header={<Heading title="Оформление заказа" caption={message.stamp} />}
      footer={
        <>
          {failed !== undefined && (
            <FormMessage tone={failed.tone} title={failed.title}>
              {failed.text}
            </FormMessage>
          )}
          <Button
            w="full"
            disabled={phase.checking}
            aria-busy={phase.checking ? 'true' : undefined}
            onClick={onCheck}
          >
            {phase.checking ? 'Проверяем результат…' : 'Проверить результат'}
          </Button>
          <Text textStyle="caption.default" color="text.secondary">
            {message.footer}
          </Text>
        </>
      }
    >
      <Stack gap="3" py="2">
        <FormMessage tone={message.tone} title={message.title}>
          {message.text}
        </FormMessage>
        <Text textStyle="caption.strong">
          Состав этой попытки ·{' '}
          {compositionText(attempt.proposal.acceptedPositions)}
        </Text>
        <PositionList
          positions={attempt.proposal.acceptedPositions}
          names={names}
        />
        <chakra.details textStyle="caption.default" color="text.secondary">
          <chakra.summary cursor="pointer">Детали попытки</chakra.summary>
          <Text textStyle="mono.default" wordBreak="break-all">
            commandID {attempt.commandID}
          </Text>
          <Text textStyle="mono.default" wordBreak="break-all">
            proposalID {attempt.proposalID}
          </Text>
        </chakra.details>
      </Stack>
    </Panel>
  );
}

// Figma F1, F2, F4, E12 and the reset of the orders service: the order did
// not go through, or the proposal is gone.
export function OutcomeOrder({
  phase,
  names,
  timeZone,
  onPrepareAgain,
  onEdit,
  onRetry,
  onOpenReplacement,
}: {
  phase: Extract<
    OrderPhase,
    { kind: 'not-found' | 'refused' | 'reset' | 'superseded' | 'empty' }
  >;
  names: Names;
  timeZone: string;
  onPrepareAgain: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onOpenReplacement: () => void;
}) {
  const message = outcomeMessage(phase, timeZone);
  const back = (label: string) => (
    <Button variant="secondary" w="full" onClick={onEdit}>
      {label}
    </Button>
  );
  const again = (
    <Button w="full" onClick={onPrepareAgain}>
      Подготовить заказ заново
    </Button>
  );
  let actions: ReactNode;
  let positions: readonly Position[] = [];
  let caption: string | undefined;
  if (phase.kind === 'refused') {
    positions = phase.proposal.acceptedPositions;
    caption = `Состав предложения · ${compositionText(positions)}`;
    actions = (
      <>
        <Button w="full" onClick={onRetry}>
          Повторить оформление
        </Button>
        {back('Вернуться к изменению заказа')}
      </>
    );
  } else if (phase.kind === 'superseded' && phase.replacement !== undefined) {
    positions = phase.replacement.acceptedPositions;
    caption = `Новое предложение · ${compositionText(positions)}`;
    actions = (
      <>
        <Button w="full" onClick={onOpenReplacement}>
          Открыть новое предложение
        </Button>
        {back('Вернуться к изменению заказа')}
      </>
    );
  } else if (phase.kind === 'reset') {
    actions = again;
  } else if (phase.kind === 'empty') {
    actions = back('Вернуться к изменению заказа');
  } else {
    actions = (
      <>
        {again}
        {back('Изменить позиции')}
      </>
    );
  }
  return (
    <Panel header={<Heading title="Оформление заказа" />} footer={actions}>
      <Stack gap="3" py="2">
        <FormMessage tone={message.tone} title={message.title}>
          {message.stamp !== undefined && (
            <Text textStyle="caption.default">{message.stamp}</Text>
          )}
          {message.text}
        </FormMessage>
        {caption !== undefined && (
          <Text textStyle="caption.strong">{caption}</Text>
        )}
        <PositionList positions={positions} names={names} />
      </Stack>
    </Panel>
  );
}

// Figma B4, 08 and D5 «Заказ оформлен».
export function PlacedOrder({
  order,
  names,
  timeZone,
  onNew,
}: {
  order: Order;
  names: Names;
  timeZone: string;
  onNew: () => void;
}) {
  const path = useRestaurantPath();
  const lines = confirmedLines(order, timeZone);
  return (
    <Panel
      header={
        <Flex gap="3" align="flex-start">
          <Icon src={checkIcon} size={24} />
          <Stack gap="0.5">
            <chakra.h2 textStyle="heading.h3" color="text.action">
              Заказ оформлен
            </chakra.h2>
            <Text textStyle="caption.default" color="text.secondary">
              {lines.stamp}
            </Text>
          </Stack>
        </Flex>
      }
      footer={
        <>
          <Button w="full" onClick={onNew}>
            Новый заказ
          </Button>
          <TextLink
            to={path('/warehouse/history')}
            alignSelf="flex-start"
            mx="1"
            my="2"
          >
            Открыть в истории склада
          </TextLink>
        </>
      }
    >
      <Stack gap="2" py="2">
        <Stack gap="1">
          <Flex gap="2" align="baseline">
            <Text textStyle="caption.default" color="text.secondary">
              Заказ
            </Text>
            <Text textStyle="mono.default">{order.orderID}</Text>
          </Flex>
          <Text textStyle="caption.default" color="text.secondary">
            {lines.composition}
          </Text>
        </Stack>
        <PositionList positions={order.acceptedPositions} names={names} />
        <Text
          px="3"
          py="2"
          bg="bg.actionSubtle"
          borderRadius="md"
          textStyle="caption.default"
        >
          Ингредиенты списаны по партиям (FEFO).
        </Text>
      </Stack>
    </Panel>
  );
}
