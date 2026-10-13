import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import {
  draftOrder,
  draftSummary,
  placedOrder,
  proposal,
} from '@/presentation/placeholder-orders';
import { Button, ButtonLink, TextLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Icon } from '@/presentation/ui/icon';
import { Stepper } from '@/presentation/ui/stepper';

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

function Heading({ title, caption }: { title: string; caption: string }) {
  return (
    <Stack gap="0.5">
      <chakra.h2 textStyle="heading.h3">{title}</chakra.h2>
      <Text textStyle="caption.default" color="text.secondary">
        {caption}
      </Text>
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

// Figma 02: the sample draft. «−», «+» and delete change nothing yet.
export function DraftOrder() {
  return (
    <Panel
      header={<Heading title="Состав заказа" caption={draftSummary} />}
      footer={
        <>
          <Text textStyle="caption.default" color="text.secondary">
            Проверка учитывает весь заказ: у блюд бывают общие ингредиенты.
            Продукты не резервируются.
          </Text>
          <ButtonLink to="/app/orders/proposal" w="full">
            Подготовить заказ
          </ButtonLink>
        </>
      }
    >
      <Stack as="ol" gap="0" listStyleType="none">
        {draftOrder.map((line) => (
          <Stack as="li" key={line.position} gap="2" py="3" {...divider}>
            <Flex align="flex-start" gap="4">
              <PositionMark>{line.position}</PositionMark>
              <Stack gap="0.5" flex="1" minW="0">
                <Text textStyle="body.default">{line.dish}</Text>
                {line.note && (
                  <Text textStyle="caption.default" color="text.secondary">
                    {line.note}
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
                aria-label={`Удалить позицию ${String(line.position)}`}
              >
                <Icon src={trashIcon} size={20} />
              </chakra.button>
            </Flex>
            <Box ps="10">
              <Stepper
                value={line.portions}
                label={`позиция ${String(line.position)}`}
              />
            </Box>
          </Stack>
        ))}
      </Stack>
    </Panel>
  );
}

// Figma 04 under the dialog: the proposal with reductions.
export function ProposalOrder({ onConfirm }: { onConfirm: () => void }) {
  return (
    <Panel
      header={<Heading title="Предложение заказа" caption={proposal.stamp} />}
      footer={
        <>
          <Text textStyle="caption.strong">{proposal.summary}</Text>
          <Button w="full" aria-haspopup="dialog" onClick={onConfirm}>
            Проверить и подтвердить
          </Button>
          <ButtonLink variant="secondary" to="/app/orders/draft" w="full">
            Вернуться к изменению заказа
          </ButtonLink>
        </>
      }
    >
      <Flex
        justify="space-between"
        gap="3"
        py="2"
        textStyle="caption.default"
        color="text.secondary"
        aria-hidden="true"
      >
        <span>Позиция</span>
        <span>запрошено → принято, порц.</span>
      </Flex>
      <Stack as="ol" gap="0" listStyleType="none">
        {proposal.rows.map((row) => (
          <Stack
            as="li"
            key={row.title}
            gap="1"
            py="3"
            borderTopWidth="1px"
            borderColor="border.default"
          >
            <Flex align="flex-start" justify="space-between" gap="3">
              <Text textStyle="body.default">{row.title}</Text>
              <Flex align="center" gap="2" flexShrink="0">
                <Text textStyle="mono.default">{row.change}</Text>
                {row.status === 'reduced' && <Badge>Сокращено</Badge>}
                {row.status === 'excluded' && (
                  <Badge tone="error">Исключено</Badge>
                )}
              </Flex>
            </Flex>
            <Text textStyle="caption.default" color="text.secondary">
              {row.note}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Panel>
  );
}

// Figma 08 «Заказ оформлен».
export function PlacedOrder() {
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
              {placedOrder.stamp}
            </Text>
          </Stack>
        </Flex>
      }
      footer={
        <>
          <ButtonLink to="/app/orders" w="full">
            Новый заказ
          </ButtonLink>
          <TextLink
            to="/app/warehouse/history"
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
            <Text textStyle="mono.default">{placedOrder.id}</Text>
          </Flex>
          <Text textStyle="caption.default" color="text.secondary">
            {placedOrder.title}
          </Text>
        </Stack>
        <Stack as="ol" gap="0" listStyleType="none">
          {placedOrder.lines.map((line) => (
            <Flex
              as="li"
              key={line.title}
              align="center"
              justify="space-between"
              gap="3"
              py="1.5"
              {...divider}
            >
              <Text textStyle="body.default">{line.title}</Text>
              <Text textStyle="mono.body" flexShrink="0" whiteSpace="nowrap">
                {line.portions}
              </Text>
            </Flex>
          ))}
        </Stack>
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
