import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import analyticsIcon from '@/presentation/assets/icons/analytics-24.svg';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import menuIcon from '@/presentation/assets/icons/menu-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import { overview } from '@/presentation/placeholder-orders';
import { ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { MaskIcon } from '@/presentation/ui/icon';
import { SegmentChoice } from '@/presentation/ui/segment-choice';

// Figma Tile (W03): an icon box, the title and the stamp, the body, the links.
// Tiles in a row share the height; the content stays at the top.
function Tile({
  icon,
  title,
  stamp,
  children,
  links,
}: {
  icon: string;
  title: string;
  stamp?: string;
  children: ReactNode;
  links: ReactNode;
}) {
  return (
    <Stack
      as="section"
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
          borderRadius="md"
          bg="bg.actionSubtle"
          color="icon.action"
        >
          <MaskIcon src={icon} size={20} />
        </Flex>
        <chakra.h2 flex="1" textStyle="heading.h3">
          {title}
        </chakra.h2>
        {stamp && (
          <Text textStyle="caption.default" color="text.secondary">
            {stamp}
          </Text>
        )}
      </Flex>
      {children}
      <Flex wrap="wrap" align="center" columnGap="4">
        {links}
      </Flex>
    </Stack>
  );
}

function TileLink({ to, children }: { to: string; children: string }) {
  return (
    <ButtonLink variant="link" to={to}>
      {children}
    </ButtonLink>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap="1">
      <Text textStyle="heading.h2">{value}</Text>
      <Text textStyle="caption.default" color="text.secondary">
        {label}
      </Text>
    </Stack>
  );
}

function SubHeading({ title, stamp }: { title: string; stamp: string }) {
  return (
    <Flex justify="space-between" gap="3" color="text.secondary">
      <chakra.h3 textStyle="caption.strong">{title}</chakra.h3>
      <Text textStyle="caption.default">{stamp}</Text>
    </Flex>
  );
}

// A batch with its expiry mark; on 390 the mark goes under the text.
function BatchRow({
  title,
  detail,
  badge,
  first,
}: {
  title: string;
  detail: string;
  badge: string;
  first: boolean;
}) {
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      align={{ base: 'flex-start', sm: 'center' }}
      justify="space-between"
      gap={{ base: '1', sm: '3' }}
      py="2.5"
      borderTopWidth={first ? '0' : '1px'}
      borderColor="border.default"
    >
      <Stack gap="0.5" minW="0">
        <Text textStyle="body.default">{title}</Text>
        <Text textStyle="mono.default" color="text.secondary">
          {detail}
        </Text>
      </Stack>
      <Badge tone="expiry">{badge}</Badge>
    </Flex>
  );
}

type Period = '24h' | '3d' | '7d';

function WarehouseTile() {
  const [period, setPeriod] = useState<Period>('24h');
  const data = overview.warehouse;
  return (
    <Tile
      icon={warehouseIcon}
      title="Склад"
      stamp={data.stamp}
      links={
        <>
          <ButtonLink variant="secondary" to="/app/warehouse/delivery">
            Принять поставку
          </ButtonLink>
          <TileLink to="/app/warehouse">Все партии и остатки</TileLink>
        </>
      }
    >
      <Stack gap="2">
        <SegmentChoice
          label="Окно сроков"
          options={[
            { value: '24h', title: '24 ч' },
            { value: '3d', title: '3 дня' },
            { value: '7d', title: '7 дней' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <Text textStyle="caption.default" color="text.secondary">
          {data.boundary}
        </Text>
      </Stack>
      <Stack gap="1">
        <Text textStyle="heading.h2">{data.count}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {data.countNote}
        </Text>
      </Stack>
      <Box>
        {data.batches.map((batch, index) => (
          <BatchRow
            key={batch.product}
            title={batch.product}
            detail={batch.batch}
            badge={batch.left}
            first={index === 0}
          />
        ))}
        <Text pt="3" textStyle="caption.default" color="text.secondary">
          {data.more}
        </Text>
      </Box>
    </Tile>
  );
}

// W03 puts the stamps beside the two subheadings, not in the tile header.
function MenuTile() {
  const data = overview.menu;
  return (
    <Tile
      icon={menuIcon}
      title="Меню и рекомендации"
      links={
        <>
          <TileLink to="/app/menu">Меню и стоп-лист</TileLink>
          <TileLink to="/app/menu">Все рекомендации</TileLink>
        </>
      }
    >
      <Stack
        gap="3"
        pb="4"
        borderBottomWidth="1px"
        borderColor="border.default"
      >
        <SubHeading title="Стоп-лист" stamp={data.stamp} />
        <Text textStyle="body.strong">{data.unavailable}</Text>
        {data.stopped.map((item) => (
          <Stack key={item.dish} gap="0.5">
            <Text textStyle="body.default">{item.dish}</Text>
            <Text textStyle="caption.default" color="text.secondary">
              {item.reason}
            </Text>
          </Stack>
        ))}
      </Stack>
      <Stack gap="2">
        <SubHeading title="Рекомендуем продать" stamp={data.stamp} />
        <Text textStyle="body.strong">{data.recommended}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {data.recommendedNote}
        </Text>
        <Box>
          {data.reasons.map((reason, index) => (
            <BatchRow
              key={reason.batch}
              title={reason.batch}
              detail={reason.perPortion}
              badge={reason.left}
              first={index === 0}
            />
          ))}
        </Box>
      </Stack>
    </Tile>
  );
}

function OrdersTile() {
  return (
    <Tile
      icon={ordersIcon}
      title="Заказы"
      links={<TileLink to="/app/warehouse/history">История продаж</TileLink>}
    >
      <Text textStyle="body.default">
        Сформируйте список позиций, проверьте корректность предложения и
        подтвердите финальную комплектацию.
      </Text>
      <Stack as="ol" gap="1.5" listStyleType="none">
        {[
          'Состав: блюда и целые порции в нужном порядке',
          'Предложение: что принято, что сокращено и почему',
          'Подтверждение: заказ оформлен только по ответу сервера',
        ].map((step, index) => (
          <Flex as="li" key={step} gap="3" align="center">
            <Text
              as="span"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              boxSize="6"
              flexShrink="0"
              bg="bg.actionSubtle"
              color="text.action"
              borderRadius="sm"
              textStyle="caption.strong"
            >
              {index + 1}
            </Text>
            <Text as="span" textStyle="body.default">
              {step}
            </Text>
          </Flex>
        ))}
      </Stack>
      <Text textStyle="caption.default" color="text.secondary">
        Подготовка не резервирует остатки.
      </Text>
    </Tile>
  );
}

// Figma W03 tiles for «Склад» and «Официант»: two columns from 1201, one
// below.
export function OverviewTiles() {
  const { catalog, writeoff, analytics } = overview;
  return (
    <Grid
      templateColumns={{
        base: 'minmax(0, 1fr)',
        xl: 'repeat(2, minmax(0, 1fr))',
      }}
      gap="6"
    >
      <WarehouseTile />
      <MenuTile />
      <OrdersTile />
      <Tile
        icon={catalogIcon}
        title="Справочники"
        stamp={catalog.stamp}
        links={
          <>
            <TileLink to="/app/catalog/products/new">Добавить продукт</TileLink>
            <TileLink to="/app/catalog/dishes/new">Определить блюдо</TileLink>
          </>
        }
      >
        <Flex columnGap="8" rowGap="4" wrap="wrap">
          <Figure value={catalog.products} label="продукта" />
          <Figure value={catalog.dishes} label="блюд" />
        </Flex>
        <Text textStyle="caption.default" color="text.secondary">
          Блюда из стоп-листа по-прежнему отображаются в общем каталоге.
        </Text>
      </Tile>
      <Tile
        icon={clockIcon}
        title="Под списание"
        stamp={writeoff.stamp}
        links={
          <TileLink to="/app/warehouse/expiry">Перейти к списанию</TileLink>
        }
      >
        <Flex columnGap="8" rowGap="4" wrap="wrap">
          <Figure value={writeoff.batches} label="партии" />
          <Figure value={writeoff.products} label="продукта" />
        </Flex>
        <Text textStyle="caption.default" color="text.secondary">
          Срок годности истёк. Партии не используются в заказах и остаются на
          складе до подтверждения списания.
        </Text>
      </Tile>
      <Tile
        icon={analyticsIcon}
        title="Аналитика"
        stamp={analytics.stamp}
        links={<TileLink to="/app/analytics">Открыть аналитику</TileLink>}
      >
        <Flex columnGap="8" rowGap="4" wrap="wrap">
          <Figure value={analytics.stocked} label="продукта с запасом" />
          <Figure value={analytics.nearest} label="ближайшие партии" />
          <Figure value={analytics.writeoff} label="под списание" />
        </Flex>
        <Text textStyle="caption.default" color="text.secondary">
          Склад сейчас и движения за выбранный период по каждому продукту:
          приход, расход на блюда, списано.
        </Text>
      </Tile>
    </Grid>
  );
}
