import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import desktopCircle18 from '@/presentation/assets/decor/hero/desktop-circle-18.svg';
import desktopCircle280 from '@/presentation/assets/decor/hero/desktop-circle-280.svg';
import desktopDots from '@/presentation/assets/decor/hero/desktop-dots.svg';
import desktopGlow from '@/presentation/assets/decor/hero/desktop-glow.svg';
import desktopRing72 from '@/presentation/assets/decor/hero/desktop-ring-72.svg';
import desktopRing96 from '@/presentation/assets/decor/hero/desktop-ring-96.svg';
import mobileCircle170 from '@/presentation/assets/decor/hero/mobile-circle-170.svg';
import mobileGlow from '@/presentation/assets/decor/hero/mobile-glow.svg';
import mobileRing28 from '@/presentation/assets/decor/hero/mobile-ring-28.svg';
import mobileRing44 from '@/presentation/assets/decor/hero/mobile-ring-44.svg';
import tabletCircle14 from '@/presentation/assets/decor/hero/tablet-circle-14.svg';
import tabletCircle220 from '@/presentation/assets/decor/hero/tablet-circle-220.svg';
import tabletGlow from '@/presentation/assets/decor/hero/tablet-glow.svg';
import tabletRing52 from '@/presentation/assets/decor/hero/tablet-ring-52.svg';
import tabletRing56 from '@/presentation/assets/decor/hero/tablet-ring-56.svg';
import { ButtonAnchor, ButtonLink } from '@/presentation/ui/actions';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';
import { enterMotion } from '@/presentation/ui/motion';
import { ProductFragments, ProductWindow } from './product-preview';

// Timings follow the hero motion spec (design-exports/landing-motion-2026-10-12).
const glowIn = enterMotion({ delay: 0, duration: 0.9 });
const barIn = (order: number, side: 'left' | 'right') =>
  enterMotion({
    delay: 0.1 + order * 0.08,
    duration: 0.6,
    x: side === 'left' ? -80 : 80,
  });
const shapeIn = (order: number) =>
  enterMotion({ delay: 0.3 + order * 0.06, duration: 0.5, y: 12 });

const barGlow = (blur: number, spread: number) =>
  `0 0 ${String(blur / 16)}rem ${String(spread / 16)}rem rgba(124, 196, 186, 0.55)`;

// Figma Hero 58:21 (1440), 59:575 (1024) and 61:801 (390). Pieces on the
// right keep their distance to the right edge; the lower group sits on the band.
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 300,
    height: 72,
    left: -90,
    top: 150,
    shadow: barGlow(90, 12),
    css: barIn(0, 'left'),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 300,
    height: 72,
    left: -10,
    top: 240,
    shadow: barGlow(90, 12),
    css: barIn(1, 'left'),
  },
  {
    kind: 'image',
    src: desktopCircle18,
    width: 18,
    height: 18,
    left: 150,
    top: 360,
    css: shapeIn(0),
  },
  {
    kind: 'plus',
    color: 'decor.mint',
    size: 24,
    thickness: 6,
    left: 210,
    top: 70,
    css: shapeIn(1),
  },
  {
    kind: 'image',
    src: desktopGlow,
    width: 920,
    height: 860,
    right: -310,
    top: -370,
    css: glowIn,
  },
  {
    kind: 'image',
    src: desktopRing96,
    width: 96,
    height: 96,
    right: 124,
    top: 120,
    css: shapeIn(2),
  },
  {
    kind: 'image',
    src: desktopDots,
    width: 72,
    height: 50,
    right: 106,
    top: 300,
    css: shapeIn(3),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 340,
    height: 80,
    left: -60,
    bottom: 150,
    css: barIn(2, 'left'),
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 340,
    height: 80,
    left: 40,
    bottom: 50,
    css: barIn(3, 'left'),
  },
  {
    kind: 'image',
    src: desktopCircle280,
    width: 280,
    height: 280,
    right: -90,
    bottom: 40,
    css: shapeIn(4),
  },
  {
    kind: 'image',
    src: desktopRing72,
    width: 124,
    height: 124,
    right: 152,
    bottom: 252,
    css: shapeIn(5),
  },
];

const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 240,
    height: 60,
    left: -170,
    top: 150,
    shadow: barGlow(70, 10),
    css: barIn(0, 'left'),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 240,
    height: 60,
    left: -120,
    top: 226,
    shadow: barGlow(70, 10),
    css: barIn(1, 'left'),
  },
  {
    kind: 'image',
    src: tabletCircle14,
    width: 14,
    height: 14,
    left: 36,
    top: 330,
    css: shapeIn(0),
  },
  {
    kind: 'image',
    src: tabletGlow,
    width: 720,
    height: 680,
    right: -260,
    top: -330,
    css: glowIn,
  },
  {
    kind: 'image',
    src: tabletRing52,
    width: 52,
    height: 52,
    right: 26,
    top: 150,
    css: shapeIn(1),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 240,
    height: 64,
    left: -80,
    bottom: 146,
    css: barIn(2, 'left'),
  },
  {
    kind: 'image',
    src: tabletCircle220,
    width: 220,
    height: 220,
    right: -80,
    bottom: 90,
    css: shapeIn(2),
  },
  {
    kind: 'image',
    src: tabletRing56,
    width: 108,
    height: 108,
    right: 88,
    bottom: 258,
    css: shapeIn(3),
  },
];

const mobileDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlow,
    width: 500,
    height: 460,
    right: -230,
    top: -250,
    css: glowIn,
  },
  {
    kind: 'image',
    src: mobileRing28,
    width: 28,
    height: 28,
    right: 62,
    top: 8,
    css: shapeIn(0),
  },
  {
    kind: 'image',
    src: mobileCircle170,
    width: 170,
    height: 170,
    right: -48,
    bottom: 408,
    css: shapeIn(1),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 180,
    height: 48,
    left: -50,
    bottom: 42,
    css: barIn(0, 'left'),
  },
  {
    kind: 'image',
    src: mobileRing44,
    width: 96,
    height: 96,
    right: 20,
    bottom: 80,
    css: shapeIn(2),
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 200,
    height: 48,
    right: -60,
    bottom: 310,
    css: barIn(1, 'right'),
  },
];

const titleId = 'hero-title';

export function HeroSection() {
  return (
    <chakra.section
      aria-labelledby={titleId}
      position="relative"
      overflow="clip"
      bg="bg.surface"
      pt={{ base: '10', sm: '16', xl: '20' }}
      pb={{ base: '12', sm: '20' }}
    >
      {/* Teal band behind the lower part of the product preview. */}
      <Box
        aria-hidden="true"
        position="absolute"
        insetX="0"
        bottom="0"
        h={{ base: '38.625rem', sm: '23.75rem' }}
        bg="bg.action"
        boxShadow={{
          base: 'inset 0 1.5rem 5.625rem rgba(124, 196, 186, 0.55)',
          sm: 'inset 0 1.5rem 8.75rem rgba(124, 196, 186, 0.55)',
        }}
        pointerEvents="none"
        css={enterMotion({ delay: 0.9, duration: 0.6 })}
      />
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
      <Stack
        position="relative"
        zIndex="content"
        align="center"
        gap={{ base: '8', sm: '12', xl: '14' }}
        maxW="80rem"
        mx="auto"
        px={{ base: '4', sm: '10' }}
      >
        <Stack
          gap={{ base: '4', sm: '5' }}
          maxW={{ sm: '50rem', xl: '56.25rem' }}
          w="full"
          textAlign={{ base: 'start', sm: 'center' }}
          align={{ base: 'stretch', sm: 'center' }}
        >
          <Text
            textStyle="caption.strong"
            color="text.action"
            css={enterMotion({ delay: 0.2, duration: 0.45, y: 12 })}
          >
            Склад · меню · заказы для ресторанов
          </Text>
          <chakra.h1
            id={titleId}
            textStyle={{
              base: 'heading.h1',
              sm: 'display.l',
              md: 'display.xl',
            }}
            css={enterMotion({ delay: 0.3, duration: 0.7, y: 24 })}
          >
            Склад, меню и заказы ресторана&nbsp;— с точностью до партии
          </chakra.h1>
          <Text
            textStyle={{ base: 'body.default', sm: 'body.lead' }}
            color="text.secondary"
            css={enterMotion({ delay: 0.6, duration: 0.5, y: 16 })}
          >
            «Ровный ход» ведёт партии и сроки годности, сначала списывает
            продукты с ближайшим сроком, показывает, почему блюдо в стоп-листе,
            и не задваивает заказ, если пропала связь.
          </Text>
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            justify="center"
            gap="3"
            pt="2"
          >
            <ButtonLink
              to="/login"
              css={enterMotion({ delay: 0.8, duration: 0.45, y: 16 })}
            >
              Открыть приложение
            </ButtonLink>
            <ButtonAnchor
              href="#how-it-works"
              variant="secondary"
              css={enterMotion({ delay: 0.88, duration: 0.45, y: 16 })}
            >
              Как это работает
            </ButtonAnchor>
          </Flex>
        </Stack>
        <ProductFragments
          display={{ base: 'grid', md: 'none' }}
          css={enterMotion({ delay: 1, duration: 0.7, y: 32 })}
        />
        <ProductWindow
          display={{ base: 'none', md: 'flex' }}
          maxW="70rem"
          css={enterMotion({ delay: 1, duration: 0.7, y: 40 })}
        />
      </Stack>
    </chakra.section>
  );
}
