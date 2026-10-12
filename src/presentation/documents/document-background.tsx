import circleBottomLeft from '@/presentation/assets/decor/document/circle-bottom-left.svg';
import circleTopRight from '@/presentation/assets/decor/document/circle-top-right.svg';
import dotsLeft from '@/presentation/assets/decor/document/dots-left.svg';
import dotsRight from '@/presentation/assets/decor/document/dots-right.svg';
import glowBottomLeft from '@/presentation/assets/decor/document/glow-bottom-left.svg';
import glowBottomRight from '@/presentation/assets/decor/document/glow-bottom-right.svg';
import glowMiddleLeft from '@/presentation/assets/decor/document/glow-middle-left.svg';
import glowMiddleRight from '@/presentation/assets/decor/document/glow-middle-right.svg';
import glowTopLeft from '@/presentation/assets/decor/document/glow-top-left.svg';
import glowTopRight from '@/presentation/assets/decor/document/glow-top-right.svg';
import mobileCircle48 from '@/presentation/assets/decor/document/mobile-circle-48.svg';
import mobileCircle64a from '@/presentation/assets/decor/document/mobile-circle-64a.svg';
import mobileCircle64b from '@/presentation/assets/decor/document/mobile-circle-64b.svg';
import mobileGlow1 from '@/presentation/assets/decor/document/mobile-glow-1.svg';
import mobileGlow2 from '@/presentation/assets/decor/document/mobile-glow-2.svg';
import mobileGlow3 from '@/presentation/assets/decor/document/mobile-glow-3.svg';
import ring40 from '@/presentation/assets/decor/document/ring-40.svg';
import ring56 from '@/presentation/assets/decor/document/ring-56.svg';
import ring72 from '@/presentation/assets/decor/document/ring-72.svg';
import tabletCircle100 from '@/presentation/assets/decor/document/tablet-circle-100.svg';
import tabletDots from '@/presentation/assets/decor/document/tablet-dots.svg';
import tabletGlow1 from '@/presentation/assets/decor/document/tablet-glow-1.svg';
import tabletGlow2 from '@/presentation/assets/decor/document/tablet-glow-2.svg';
import tabletGlow3 from '@/presentation/assets/decor/document/tablet-glow-3.svg';
import tabletGlow4 from '@/presentation/assets/decor/document/tablet-glow-4.svg';
import tabletGlow5 from '@/presentation/assets/decor/document/tablet-glow-5.svg';
import tabletRing40 from '@/presentation/assets/decor/document/tablet-ring-40.svg';
import tabletRing48 from '@/presentation/assets/decor/document/tablet-ring-48.svg';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';

// Figma Page background 348:3582, Kind=Document. Pieces keep their corner or
// mid-height anchors, so one layer fits a document of any length.
const desktop: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: glowTopLeft,
    width: 880,
    height: 760,
    left: -420,
    top: 20,
  },
  {
    kind: 'image',
    src: glowTopRight,
    width: 900,
    height: 780,
    right: -470,
    top: -10,
  },
  {
    kind: 'image',
    src: glowMiddleLeft,
    width: 680,
    height: 600,
    left: -290,
    middle: 40,
  },
  {
    kind: 'image',
    src: glowMiddleRight,
    width: 680,
    height: 600,
    right: -330,
    middle: 0,
  },
  {
    kind: 'image',
    src: glowBottomRight,
    width: 900,
    height: 760,
    right: -450,
    bottom: 10,
  },
  {
    kind: 'image',
    src: glowBottomLeft,
    width: 860,
    height: 740,
    left: -400,
    bottom: 20,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 220,
    height: 56,
    left: -70,
    top: 80,
  },
  {
    kind: 'bar',
    color: 'decor.skySoft',
    width: 220,
    height: 56,
    left: -40,
    top: 152,
  },
  { kind: 'image', src: ring72, width: 72, height: 72, left: 70, top: 262 },
  {
    kind: 'image',
    src: dotsLeft,
    width: 85,
    height: 65,
    left: 44,
    middle: -7.5,
  },
  {
    kind: 'plus',
    color: 'decor.teal',
    size: 22,
    thickness: 6,
    left: 120,
    middle: 101,
  },
  {
    kind: 'image',
    src: circleBottomLeft,
    width: 240,
    height: 240,
    left: -150,
    bottom: 60,
  },
  { kind: 'image', src: ring40, width: 40, height: 40, left: 112, bottom: 160 },
  {
    kind: 'image',
    src: circleTopRight,
    width: 240,
    height: 240,
    right: -130,
    top: 60,
  },
  {
    kind: 'plus',
    color: 'decor.violet',
    size: 22,
    thickness: 6,
    right: 122,
    top: 330,
  },
  { kind: 'image', src: ring56, width: 56, height: 56, right: 28, top: 372 },
  {
    kind: 'bar',
    color: 'decor.mintSoft',
    width: 240,
    height: 56,
    right: -130,
    middle: 48,
  },
  {
    kind: 'bar',
    color: 'decor.violetSoft',
    width: 240,
    height: 56,
    right: -90,
    middle: 120,
  },
  {
    kind: 'image',
    src: dotsRight,
    width: 65,
    height: 45,
    right: 39,
    bottom: 155,
  },
  {
    kind: 'bar',
    color: 'decor.skySoft',
    width: 260,
    height: 60,
    right: -120,
    bottom: 28,
  },
];

const tablet: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlow1,
    width: 780,
    height: 680,
    left: -390,
    top: -10,
  },
  {
    kind: 'image',
    src: tabletGlow2,
    width: 840,
    height: 720,
    right: -416,
    top: -20,
  },
  {
    kind: 'image',
    src: tabletGlow3,
    width: 600,
    height: 520,
    right: -266,
    middle: 0,
  },
  {
    kind: 'image',
    src: tabletGlow4,
    width: 800,
    height: 680,
    right: -256,
    bottom: 0,
  },
  {
    kind: 'image',
    src: tabletGlow5,
    width: 760,
    height: 640,
    left: -350,
    bottom: 30,
  },
  {
    kind: 'image',
    src: tabletRing48,
    width: 48,
    height: 48,
    right: -24,
    top: 140,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 160,
    height: 40,
    right: -128,
    top: 260,
  },
  {
    kind: 'image',
    src: tabletCircle100,
    width: 100,
    height: 100,
    right: -66,
    middle: 30,
  },
  {
    kind: 'image',
    src: tabletRing40,
    width: 40,
    height: 40,
    left: -16,
    middle: 50,
  },
  {
    kind: 'bar',
    color: 'decor.mintSoft',
    width: 160,
    height: 40,
    left: -120,
    bottom: 220,
  },
  {
    kind: 'image',
    src: tabletDots,
    width: 77,
    height: 23,
    right: 127,
    bottom: 37,
  },
];

const mobile: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlow1,
    width: 520,
    height: 460,
    right: -210,
    top: 0,
  },
  {
    kind: 'image',
    src: mobileGlow2,
    width: 540,
    height: 480,
    left: -280,
    middle: 18,
  },
  {
    kind: 'image',
    src: mobileGlow3,
    width: 540,
    height: 440,
    right: -260,
    bottom: 34,
  },
  {
    kind: 'image',
    src: mobileCircle64a,
    width: 64,
    height: 64,
    right: -48,
    top: 170,
  },
  {
    kind: 'image',
    src: mobileCircle64b,
    width: 64,
    height: 64,
    left: -48,
    middle: 30,
  },
  {
    kind: 'image',
    src: mobileCircle48,
    width: 48,
    height: 48,
    right: -32,
    bottom: 196,
  },
];

export function DocumentBackground() {
  return (
    <>
      <DecorLayer pieces={mobile} display={{ base: 'block', md: 'none' }} />
      <DecorLayer
        pieces={tablet}
        display={{ base: 'none', md: 'block', xl: 'none' }}
      />
      <DecorLayer pieces={desktop} display={{ base: 'none', xl: 'block' }} />
    </>
  );
}
