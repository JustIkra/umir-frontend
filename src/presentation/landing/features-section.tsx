import { Flex, Grid, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import desktopGlowCenter from '@/presentation/assets/decor/features/desktop-glow-center.svg';
import desktopGlowLeft from '@/presentation/assets/decor/features/desktop-glow-left.svg';
import desktopGlowRight from '@/presentation/assets/decor/features/desktop-glow-right.svg';
import mobileGlowBottom from '@/presentation/assets/decor/features/mobile-glow-bottom.svg';
import mobileGlowMiddle from '@/presentation/assets/decor/features/mobile-glow-middle.svg';
import mobileGlowTop from '@/presentation/assets/decor/features/mobile-glow-top.svg';
import tabletGlowCenter from '@/presentation/assets/decor/features/tablet-glow-center.svg';
import tabletGlowLeft from '@/presentation/assets/decor/features/tablet-glow-left.svg';
import tabletGlowRight from '@/presentation/assets/decor/features/tablet-glow-right.svg';
import { ButtonLook } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';
import { rem } from '@/presentation/ui/units';
import { LandingSection, SectionContent, SectionHead } from './section';

// Figma «Возможности» 58:358 (1440), 59:730 (1024) and 61:931 (390).
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: desktopGlowLeft,
    width: 960,
    height: 860,
    left: -380,
    top: 60,
  },
  {
    kind: 'image',
    src: desktopGlowRight,
    width: 980,
    height: 880,
    right: -380,
    bottom: -140,
  },
  {
    kind: 'image',
    src: desktopGlowCenter,
    width: 920,
    height: 800,
    center: 100,
    middle: 0,
  },
];
const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlowLeft,
    width: 840,
    height: 760,
    left: -340,
    top: 80,
  },
  {
    kind: 'image',
    src: tabletGlowRight,
    width: 840,
    height: 760,
    right: -320,
    bottom: -100,
  },
  {
    kind: 'image',
    src: tabletGlowCenter,
    width: 800,
    height: 720,
    center: 68,
    middle: 0,
  },
];
const mobileDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlowTop,
    width: 620,
    height: 560,
    left: -280,
    top: 180,
  },
  {
    kind: 'image',
    src: mobileGlowMiddle,
    width: 640,
    height: 580,
    right: -300,
    middle: 0,
  },
  {
    kind: 'image',
    src: mobileGlowBottom,
    width: 620,
    height: 560,
    left: -240,
    bottom: 80,
  },
];

const tones = {
  teal: { bg: 'bg.actionSubtle', border: 'decor.tealSoft' },
  violet: { bg: 'bg.tintViolet', border: 'decor.violetSoft' },
  mint: { bg: 'bg.tintMint', border: 'decor.mintSoft' },
  sky: { bg: 'bg.tintSky', border: 'decor.skySoft' },
} as const;

// Figma «Feature / …»: a tinted card with copy and a white demo panel.
// From the tablet layout up, each card spans two rows of the bento grid and
// shares them through subgrid: copy above, panel below. Cards in one row then
// start and end their panels on the same lines, whatever the copy length.
function FeatureCard({
  area,
  tone,
  title,
  description,
  visualHeight,
  children,
}: {
  area: string;
  tone: keyof typeof tones;
  title: string;
  description: string;
  // The panel keeps this height on phones and clips what does not fit, so
  // they show a readable fragment instead of a long card. On wider screens it
  // is the minimum, and the panel stretches to its neighbours in the row.
  visualHeight: number;
  children: ReactNode;
}) {
  const colors = tones[tone];
  return (
    <Stack
      as="article"
      gridArea={area}
      display={{ base: 'flex', sm: 'grid' }}
      gridTemplateRows={{ sm: 'subgrid' }}
      gap="4"
      px={{ base: 'calc({spacing.4} - 1px)', sm: 'calc({spacing.6} - 1px)' }}
      py={{ base: 'calc({spacing.5} - 1px)', sm: 'calc({spacing.6} - 1px)' }}
      bg={colors.bg}
      borderWidth="1px"
      borderColor={colors.border}
      borderRadius="md"
    >
      <Stack gap="2" gridRow={{ sm: '1' }}>
        <Text as="h3" textStyle="heading.h3">
          {title}
        </Text>
        <Text textStyle="body.default" color="text.secondary">
          {description}
        </Text>
      </Stack>
      <Stack
        aria-hidden="true"
        flexShrink="0"
        gridRow={{ sm: '2 / -1' }}
        h={{ base: rem(visualHeight), sm: 'auto' }}
        minH={{ sm: rem(visualHeight) }}
        overflow="clip"
        gap="2"
        p="calc({spacing.4} - 1px)"
        bg="bg.surface"
        borderWidth="1px"
        borderColor={colors.border}
        borderRadius="md"
        pointerEvents="none"
      >
        {children}
      </Stack>
    </Stack>
  );
}

function Line({
  title,
  note,
  quantity,
  badge,
  first = false,
}: {
  title: string;
  note: string;
  quantity?: string;
  badge?: ReactNode;
  first?: boolean;
}) {
  return (
    <Stack
      gap="0.5"
      py="2.5"
      borderTopWidth={first ? undefined : '1px'}
      borderColor="border.default"
    >
      <Flex wrap="wrap" align="center" columnGap="3" rowGap="1.5">
        <Text flex="1" minW="9.375rem" textStyle="body.default">
          {title}
        </Text>
        {quantity && (
          <Text textStyle="numeric.default" whiteSpace="nowrap">
            {quantity}
          </Text>
        )}
        {badge}
      </Flex>
      <Text textStyle="caption.default" color="text.secondary">
        {note}
      </Text>
    </Stack>
  );
}

function OrderConfirmationVisual() {
  return (
    <>
      <Flex gap="2" color="text.secondary">
        <Text flex="1" textStyle="caption.strong">
          Состав заказа
        </Text>
        <Text textStyle="caption.default">обновлено в 14:32</Text>
      </Flex>
      <Line
        first
        title="1 · Паста карбонара"
        quantity="4&nbsp;→&nbsp;3 порции"
        badge={<Badge tone="neutral">Сокращено</Badge>}
        note="Сливки 33%: на 4 порции нужно 200&nbsp;мл, есть 150&nbsp;мл"
      />
      <Line
        title="2 · Цезарь с курицей"
        quantity="2&nbsp;→&nbsp;0"
        badge={<Badge tone="error">Исключено</Badge>}
        note="Куриное филе: нужно 240&nbsp;г, есть 0&nbsp;г"
      />
      <Line
        title="3 · Ризотто с пармезаном"
        quantity="1&nbsp;→&nbsp;1"
        note="Без изменений"
      />
      <Flex wrap="wrap" align="center" columnGap="3" rowGap="2" pt="2">
        <ButtonLook>Подтвердить состав</ButtonLook>
        <Text textStyle="caption.default" color="text.secondary">
          До подтверждения ничего не списывается.
        </Text>
      </Flex>
    </>
  );
}

// Each bento row of cards is two grid rows: one for copy, one for panels.
const rows = (areas: string) => `"${areas}" "${areas}"`;

export function FeaturesSection() {
  const id = 'features';
  return (
    <LandingSection id={id}>
      <DecorLayer
        pieces={mobileDecor}
        display={{ base: 'block', sm: 'none' }}
      />
      <DecorLayer
        pieces={tabletDecor}
        display={{ base: 'none', sm: 'block', xl: 'none' }}
      />
      <DecorLayer
        pieces={desktopDecor}
        display={{ base: 'none', xl: 'block' }}
      />
      <SectionContent>
        <SectionHead
          id={id}
          eyebrow="Возможности"
          title="Каждое число объяснено"
          lead="Из какой партии, на какую порцию и на какое время — мы показываем не только результат, но и откуда он взялся."
        />
        <Grid
          gap={{ base: '4', sm: '6' }}
          alignItems="stretch"
          templateColumns={{ base: '1fr', sm: '1fr 1fr', xl: '1fr 1fr 1fr' }}
          templateAreas={{
            base: '"order" "fefo" "stop" "recs" "delivery" "history"',
            sm: `${rows('order order')} ${rows('stop delivery')} ${rows('fefo recs')} ${rows('history history')}`,
            xl: `${rows('order order stop')} ${rows('order order delivery')} ${rows('fefo recs history')}`,
          }}
        >
          <FeatureCard
            area="order"
            visualHeight={338}
            tone="teal"
            title="Заказ по реальным остаткам"
            description="Перед оформлением мы покажем, какие позиции сократились или убраны и почему, — оформится только то, что вы подтвердили."
          >
            <OrderConfirmationVisual />
          </FeatureCard>
          <FeatureCard
            area="stop"
            visualHeight={98}
            tone="violet"
            title="Стоп-лист с причинами"
            description="У каждого блюда в стоп-листе видно, какого продукта не хватает на порцию."
          >
            <Line
              first
              title="Цезарь с курицей"
              badge={<Badge tone="neutral">В стоп-листе</Badge>}
              note="Куриное филе — нужно 120&nbsp;г, есть 0&nbsp;г"
            />
          </FeatureCard>
          <FeatureCard
            area="delivery"
            visualHeight={118}
            tone="sky"
            title="Поставка без двойного прихода"
            description="Каждая строка становится партией со своим сроком годности, а повторная отправка не задвоит приход."
          >
            <Line
              first
              title="Поставка №&nbsp;1187"
              badge={<Badge tone="success">Принята</Badge>}
              note="10 октября, 09:40 · 3 строки → 3 партии"
            />
          </FeatureCard>
          <FeatureCard
            area="fefo"
            visualHeight={202}
            tone="mint"
            title="Сначала — продукты с ближайшим сроком"
            description="Мы списываем продукты по очереди, начиная с партии, у которой срок истекает раньше всех."
          >
            <Line
              first
              title="Сыр пармезан · P-0142"
              badge={<Badge tone="expiry">Истекает через 6&nbsp;ч</Badge>}
              note="Остаток 1&nbsp;200&nbsp;г · спишется первой"
            />
            <Line
              title="Сыр пармезан · P-0151"
              badge={<Badge tone="neutral">Через 4&nbsp;дня</Badge>}
              note="Остаток 2&nbsp;000&nbsp;г"
            />
          </FeatureCard>
          <FeatureCard
            area="recs"
            visualHeight={160}
            tone="violet"
            title="Подскажем, что продать первым"
            description="Советуем блюда из продуктов с ближайшим сроком и показываем, сколько каждого уходит на порцию."
          >
            <Text textStyle="body.strong">Ризотто с пармезаном и рукколой</Text>
            <Line
              first
              title="Пармезан · P-0142"
              badge={<Badge tone="expiry">Истекает через 6&nbsp;ч</Badge>}
              note="40&nbsp;г на порцию"
            />
          </FeatureCard>
          <FeatureCard
            area="history"
            visualHeight={246}
            tone="teal"
            title="Вся история с точным временем"
            description="У каждого поступления, продажи и списания по сроку есть дата и точное время."
          >
            <Line
              first
              title="Поступление · поставка №&nbsp;1187"
              note="10 октября, 09:40"
            />
            <Line
              title="Списание по сроку · сливки 33%"
              note="10 октября, 11:00"
            />
            <Line
              title="Продажа · ризотто с пармезаном"
              note="10 октября, 12:15"
            />
          </FeatureCard>
        </Grid>
      </SectionContent>
    </LandingSection>
  );
}
