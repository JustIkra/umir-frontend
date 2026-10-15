import { Box, Stack, Text, chakra } from '@chakra-ui/react';
import circle240 from '@/presentation/assets/decor/cta/circle-240.svg';
import desktopGlowLeft from '@/presentation/assets/decor/cta/desktop-glow-left.svg';
import desktopGlowRight from '@/presentation/assets/decor/cta/desktop-glow-right.svg';
import desktopRing64 from '@/presentation/assets/decor/cta/desktop-ring-64.svg';
import mobileCircle160 from '@/presentation/assets/decor/cta/mobile-circle-160.svg';
import mobileGlow from '@/presentation/assets/decor/cta/mobile-glow.svg';
import tabletGlowLeft from '@/presentation/assets/decor/cta/tablet-glow-left.svg';
import tabletGlowRight from '@/presentation/assets/decor/cta/tablet-glow-right.svg';
import tabletRing56 from '@/presentation/assets/decor/cta/tablet-ring-56.svg';
import { ButtonLink } from '@/presentation/ui/actions';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';

// Figma «Финальный призыв» 58:513 (1440), 59:877 (1024) and 61:1075 (390).
// Pieces are positioned inside the CTA band.
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: desktopGlowLeft,
    width: 760,
    height: 600,
    left: -380,
    top: -160,
  },
  {
    kind: 'image',
    src: desktopGlowRight,
    width: 720,
    height: 560,
    right: -240,
    top: -4,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 200,
    height: 64,
    left: -70,
    top: 32,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 200,
    height: 64,
    left: -10,
    top: 112,
  },
  {
    kind: 'image',
    src: circle240,
    width: 240,
    height: 240,
    right: -50,
    top: 120,
  },
  {
    kind: 'image',
    src: desktopRing64,
    width: 64,
    height: 64,
    right: 146,
    top: 32,
  },
];
const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlowLeft,
    width: 660,
    height: 540,
    left: -370,
    top: -150,
  },
  {
    kind: 'image',
    src: tabletGlowRight,
    width: 640,
    height: 520,
    right: -210,
    top: 0,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 160,
    height: 64,
    left: -70,
    top: 32,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 160,
    height: 64,
    left: -10,
    top: 112,
  },
  {
    kind: 'image',
    src: circle240,
    width: 240,
    height: 240,
    right: -50,
    top: 104,
  },
  {
    kind: 'image',
    src: tabletRing56,
    width: 56,
    height: 56,
    right: 16,
    top: 18,
  },
];
const mobileDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlow,
    width: 480,
    height: 420,
    left: -230,
    top: 22,
  },
  {
    kind: 'image',
    src: mobileCircle160,
    width: 160,
    height: 160,
    right: -60,
    top: 142,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 140,
    height: 36,
    left: -60,
    top: 188,
  },
];

const titleId = 'final-cta-title';

export function FinalCtaSection() {
  return (
    <chakra.section
      aria-labelledby={titleId}
      maxW="80rem"
      mx="auto"
      px={{ base: '4', sm: '10' }}
      pb={{ base: '16', sm: '20', xl: '24' }}
    >
      <Box position="relative" overflow="clip" bg="bg.action" borderRadius="xl">
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
          align={{ base: 'stretch', sm: 'center' }}
          gap={{ base: '3', sm: '4' }}
          px={{ base: '5', sm: '10', xl: '14' }}
          py={{ base: '8', sm: '12', xl: '14' }}
          textAlign={{ base: 'start', sm: 'center' }}
          color="text.onAction"
        >
          <chakra.h2
            id={titleId}
            textStyle={{ base: 'heading.h2', sm: 'display.l' }}
          >
            Войдите и начните работу
          </chakra.h2>
          <Text textStyle={{ base: 'body.default', sm: 'body.lead' }}>
            Склад, меню и заказы — в одном окне.
          </Text>
          <Box pt="2">
            <ButtonLink
              to="/login"
              variant="secondary"
              w={{ base: 'full', sm: 'auto' }}
            >
              Открыть приложение
            </ButtonLink>
          </Box>
        </Stack>
      </Box>
    </chakra.section>
  );
}
