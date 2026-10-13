import {
  Box,
  Flex,
  Stack,
  Text,
  type BoxProps,
  type FlexProps,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import menu20 from '@/presentation/assets/icons/menu-20.svg';
import warehouse20 from '@/presentation/assets/icons/warehouse-20.svg';
import analytics24 from '@/presentation/assets/icons/analytics-24.svg';
import catalog24 from '@/presentation/assets/icons/catalog-24.svg';
import chevron20 from '@/presentation/assets/icons/chevron-20.svg';
import menu24 from '@/presentation/assets/icons/menu-24.svg';
import orders24 from '@/presentation/assets/icons/orders-24.svg';
import overview24 from '@/presentation/assets/icons/overview-24-active.svg';
import userGlyph from '@/presentation/assets/icons/user-glyph.svg';
import warehouse24 from '@/presentation/assets/icons/warehouse-24.svg';
import windowDot from '@/presentation/assets/preview/window-dot.svg';
import { ButtonLook } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Icon } from '@/presentation/ui/icon';
import { Wordmark } from '@/presentation/ui/logo';
import { rem } from '@/presentation/ui/units';

// Product illustrations are assembled from app components (Figma Product
// preview 50:625 and Hero fragment 116:1406). They are pictures, so assistive
// technology gets one description and the inner controls stay inert.
const illustration = (label: string): BoxProps => ({
  role: 'img',
  'aria-label': label,
  pointerEvents: 'none',
  userSelect: 'none',
});

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Flex
      align="center"
      gap="3"
      px="3"
      py="2"
      borderRadius="md"
      bg={active ? 'bg.actionSubtle' : undefined}
    >
      <Icon src={icon} size={24} />
      <Text
        flex="1"
        textStyle={active ? 'label.default' : 'body.default'}
        color={active ? 'text.action' : 'text.primary'}
      >
        {label}
      </Text>
    </Flex>
  );
}

function Sidebar() {
  return (
    <Flex
      direction="column"
      w="15rem"
      flexShrink="0"
      h="full"
      px="3"
      py="4"
      bg="bg.surface"
      borderRightWidth="1px"
      borderColor="border.default"
    >
      <Stack gap="6">
        <Box pl="3" py="1">
          <Wordmark />
        </Box>
        <Stack gap="1">
          <NavItem icon={overview24} label="Обзор" active />
          <NavItem icon={orders24} label="Заказы" />
          <NavItem icon={warehouse24} label="Склад" />
          <NavItem icon={catalog24} label="Справочники" />
          <NavItem icon={menu24} label="Меню и рекомендации" />
          <NavItem icon={analytics24} label="Аналитика" />
        </Stack>
      </Stack>
      <Stack gap="3" mt="auto" pb="1">
        <Box h="1px" bg="border.default" />
        <Flex align="center" gap="3" px="3" py="2">
          <Box position="relative" boxSize="6" flexShrink="0">
            <Icon
              src={userGlyph}
              size={16}
              position="absolute"
              left={rem(4.125)}
              top={rem(3.625)}
              w={rem(15.75)}
              h={rem(16.75)}
            />
          </Box>
          <Box flex="1" minW="0">
            <Text textStyle="body.strong" truncate>
              Марина Белова
            </Text>
            <Text textStyle="caption.default" color="text.secondary">
              На Пушкинской · Склад, Официант
            </Text>
          </Box>
          <Icon src={chevron20} size={20} transform="rotate(180deg)" />
        </Flex>
      </Stack>
    </Flex>
  );
}

function Tile({
  icon,
  title,
  time,
  children,
}: {
  icon: string;
  title: string;
  time?: string;
  children: ReactNode;
}) {
  return (
    <Stack
      flex="1"
      minW="0"
      gap="4"
      p="6"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
    >
      <Flex align="center" gap="3">
        <Flex
          boxSize="8"
          flexShrink="0"
          align="center"
          justify="center"
          bg="bg.actionSubtle"
          borderRadius="md"
        >
          <Icon src={icon} size={20} />
        </Flex>
        <Text flex="1" textStyle="heading.h3">
          {title}
        </Text>
        {time && (
          <Text textStyle="caption.default" color="text.secondary">
            {time}
          </Text>
        )}
      </Flex>
      {children}
    </Stack>
  );
}

function BatchRow({
  title,
  detail,
  expiry,
  first = false,
}: {
  title: string;
  detail: string;
  expiry: string;
  first?: boolean;
}) {
  return (
    <Flex
      wrap="wrap"
      align="center"
      columnGap="3"
      rowGap="1.5"
      py="2.5"
      borderTopWidth={first ? undefined : '1px'}
      borderColor="border.default"
    >
      <Stack gap="0.5" flex="1" minW="10.5rem">
        <Text textStyle="body.default">{title}</Text>
        <Text textStyle="mono.default" color="text.secondary">
          {detail}
        </Text>
      </Stack>
      <Badge tone="expiry">{expiry}</Badge>
    </Flex>
  );
}

function SubHeader({ title, time }: { title: string; time: string }) {
  return (
    <Flex gap="2" color="text.secondary">
      <Text flex="1" textStyle="caption.strong">
        {title}
      </Text>
      <Text textStyle="caption.default">{time}</Text>
    </Flex>
  );
}

function WarehouseTile() {
  return (
    <Tile icon={warehouse20} title="Склад" time="оценка 14:32">
      <Stack gap="3">
        <Flex wrap="wrap" align="center" columnGap="3" rowGap="2">
          <Flex gap="1" p="1" bg="bg.subtle" borderRadius="md">
            <Text
              px="calc({spacing.3} - 1px)"
              py="calc(0.375rem - 1px)"
              bg="bg.surface"
              borderWidth="1px"
              borderColor="border.strong"
              borderRadius="sm"
              textStyle="caption.strong"
            >
              24 ч
            </Text>
            {['3 дня', '7 дней'].map((label) => (
              <Text
                key={label}
                px="3"
                py="1.5"
                textStyle="caption.default"
                color="text.secondary"
              >
                {label}
              </Text>
            ))}
          </Flex>
          <Text textStyle="caption.default" color="text.secondary">
            Граница: 11.10.2026, 14:32 (Москва, UTC+3)
          </Text>
        </Flex>
        <Stack gap="0.5">
          <Text textStyle="heading.h2">4 партии</Text>
          <Text textStyle="caption.default" color="text.secondary">
            с остатком и сроком до выбранной границы
          </Text>
        </Stack>
        <Box>
          <BatchRow
            first
            title="Сыр пармезан"
            detail="P-0142 · остаток&nbsp;1&nbsp;200&nbsp;г"
            expiry="Истекает через 6&nbsp;ч"
          />
          <BatchRow
            title="Руккола"
            detail="P-0150 · остаток&nbsp;450&nbsp;г"
            expiry="Истекает через 6&nbsp;ч"
          />
          <BatchRow
            title="Сливки 33%"
            detail="P-0139 · остаток&nbsp;20&nbsp;мл"
            expiry="Истекает через 14&nbsp;ч"
          />
        </Box>
        <Text textStyle="caption.default" color="text.secondary">
          Ещё 1 партия в окне
        </Text>
      </Stack>
      <Flex wrap="wrap" gap="2">
        <ButtonLook variant="secondary">Принять поставку</ButtonLook>
        <ButtonLook variant="link">Все партии и остатки</ButtonLook>
      </Flex>
    </Tile>
  );
}

function StopListDish({ name, reason }: { name: string; reason: string }) {
  return (
    <Stack gap="0.5">
      <Text textStyle="body.default">{name}</Text>
      <Text textStyle="caption.default" color="text.secondary">
        {reason}
      </Text>
    </Stack>
  );
}

function MenuTile() {
  return (
    <Tile icon={menu20} title="Меню и рекомендации">
      <Stack gap="3">
        <Stack gap="2">
          <SubHeader title="Стоп-лист" time="оценка 14:32" />
          <Text textStyle="body.strong">2 блюда недоступны</Text>
          <StopListDish
            name="Паста карбонара"
            reason="Не хватает на порцию: сливки 33% — нужно 50&nbsp;мл, есть 20&nbsp;мл"
          />
          <StopListDish
            name="Цезарь с курицей"
            reason="Не хватает на порцию: куриное филе — нужно 120&nbsp;г, есть 0&nbsp;г"
          />
        </Stack>
        <Box h="1px" bg="border.default" />
        <Stack gap="2">
          <SubHeader title="Рекомендуем продать" time="оценка 14:32" />
          <Text textStyle="body.strong">
            1. Ризотто с пармезаном и рукколой
          </Text>
          <Text textStyle="caption.default" color="text.secondary">
            Ближайший срок партий одной порции — 10.10.2026, 20:30. Обе причины:
          </Text>
          <Box>
            <BatchRow
              first
              title="Сыр пармезан · партия P-0142"
              detail="40&nbsp;г на порцию"
              expiry="Истекает через 6&nbsp;ч"
            />
            <BatchRow
              title="Руккола · партия P-0150"
              detail="30&nbsp;г на порцию"
              expiry="Истекает через 6&nbsp;ч"
            />
          </Box>
        </Stack>
      </Stack>
      <Flex wrap="wrap" gap="2">
        <ButtonLook variant="link">Меню и стоп-лист</ButtonLook>
        <ButtonLook variant="link">Все рекомендации</ButtonLook>
      </Flex>
    </Tile>
  );
}

// Desktop and tablet: the «Обзор» window, cut at a fixed height.
export function ProductWindow(props: FlexProps) {
  return (
    <Flex
      {...illustration(
        'Окно «Ровного хода»: обзор склада со сроками партий, стоп-лист и рекомендации',
      )}
      direction="column"
      w="full"
      h="37.5rem"
      overflow="clip"
      bg="bg.canvas"
      borderWidth="1px"
      borderColor="border.default"
      borderTopRadius="xl"
      boxShadow="overlay"
      {...props}
    >
      <Flex
        align="center"
        gap="2"
        px="4"
        py="3"
        bg="bg.surface"
        borderBottomWidth="1px"
        borderColor="border.default"
      >
        {[0, 1, 2].map((dot) => (
          <Icon key={dot} src={windowDot} size={10} />
        ))}
        <Text
          flex="1"
          textAlign="center"
          textStyle="caption.default"
          color="text.secondary"
        >
          Ровный ход — Обзор
        </Text>
        <Box w={rem(46)} flexShrink="0" />
      </Flex>
      <Flex flex="1" minH="0">
        <Sidebar />
        <Stack flex="1" minW="0" gap="5" px="8" py="7">
          <Flex align="center" justify="space-between" gap="4">
            <Stack gap="1">
              <Text textStyle="heading.h1">Обзор</Text>
              <Text textStyle="caption.default" color="text.secondary">
                Суббота, 10 октября 2026
              </Text>
            </Stack>
            <ButtonLook>Собрать заказ</ButtonLook>
          </Flex>
          <Flex gap="5" align="flex-start">
            <WarehouseTile />
            <MenuTile />
          </Flex>
        </Stack>
      </Flex>
    </Flex>
  );
}

function Fragment({ children }: { children: ReactNode }) {
  return (
    <Stack
      gap="3"
      p="calc({spacing.5} - 1px)"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="overlay"
    >
      {children}
    </Stack>
  );
}

type LineStatus = 'accepted' | 'reduced' | 'excluded';

function ProposalLine({
  name,
  quantity,
  status,
  reason,
  last = false,
}: {
  name: string;
  quantity: string;
  status: LineStatus;
  reason: string;
  last?: boolean;
}) {
  return (
    <Stack
      gap="1"
      pt="3"
      pb={last ? '3' : 'calc({spacing.3} - 1px)'}
      borderBottomWidth={last ? undefined : '1px'}
      borderColor="border.default"
    >
      <Flex align="center" gap="2">
        <Text flex="1" textStyle="body.default">
          {name}
        </Text>
        <Text textStyle="mono.default" whiteSpace="nowrap">
          {quantity}
        </Text>
        {status === 'reduced' && <Badge tone="neutral">Сокращено</Badge>}
        {status === 'excluded' && <Badge tone="error">Исключено</Badge>}
      </Flex>
      <Text textStyle="caption.default" color="text.secondary">
        {reason}
      </Text>
    </Stack>
  );
}

function OrderFragment() {
  return (
    <Fragment>
      <Flex gap="2" color="text.secondary">
        <Text flex="1" textStyle="caption.strong">
          Предложение заказа
        </Text>
        <Text textStyle="caption.default">оценка 15:05:37 UTC+3</Text>
      </Flex>
      <Box>
        <ProposalLine
          name="2 · Паста с лососем и шпинатом"
          quantity="3 → 1"
          status="reduced"
          reason="Филе лосося: нужно 360 г, доступно для позиции 220 г"
        />
        <ProposalLine
          name="4 · Салат с лососем и киноа"
          quantity="1 → 0"
          status="excluded"
          reason="Филе лосося: нужно 110 г, доступно для позиции 100 г"
        />
        <ProposalLine
          name="1 · Тартар из лосося с авокадо"
          quantity="2 → 2"
          status="accepted"
          reason="Без изменений"
          last
        />
      </Box>
      <Text textStyle="body.strong">Итог: 4 позиции, 6 порций</Text>
      <ButtonLook w="full">Оформить оставшиеся блюда</ButtonLook>
      <Text textStyle="caption.default" color="text.secondary">
        Сокращение не принимается автоматически.
      </Text>
    </Fragment>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Flex
      gap="3"
      pt="calc({spacing.2} - 1px)"
      pb="2"
      borderTopWidth="1px"
      borderColor="border.default"
    >
      <Text
        w="8rem"
        flexShrink="0"
        textStyle="caption.default"
        color="text.secondary"
      >
        {label}
      </Text>
      <Text flex="1" textStyle="body.default">
        {value}
      </Text>
    </Flex>
  );
}

function BatchFragment() {
  return (
    <Fragment>
      <Flex align="center" gap="2">
        <Text flex="1" textStyle="mono.default" color="text.secondary">
          Партия P-0142
        </Text>
        <Badge tone="expiry">Истекает через 6 ч</Badge>
      </Flex>
      <Stack gap="0.5">
        <Text textStyle="heading.h3">Сыр пармезан</Text>
        <Flex align="baseline" gap="2">
          <Text textStyle="heading.h2">1 200 г</Text>
          <Text textStyle="caption.default" color="text.secondary">
            остаток
          </Text>
        </Flex>
      </Stack>
      <Box>
        <Fact label="Годен до" value="10.10.2026, 20:30 UTC+3" />
        <Fact label="Поставка" value="№ 1187 · строка 2" />
        <Fact label="Расход на порцию" value="Ризотто с пармезаном — 40 г" />
      </Box>
    </Fragment>
  );
}

// Narrow screens: two readable fragments at natural size instead of a shrunken
// window (the order with its reduction and the batch it draws from).
export function ProductFragments(props: BoxProps) {
  return (
    <Box
      {...illustration(
        'Пример интерфейса: предложение заказа с сокращённой и исключённой позицией и партия пармезана со сроком годности',
      )}
      display="grid"
      gridTemplateColumns={{ base: '1fr', sm: '1fr 1fr' }}
      alignItems="start"
      gap="4"
      w="full"
      {...props}
    >
      <OrderFragment />
      <BatchFragment />
    </Box>
  );
}
