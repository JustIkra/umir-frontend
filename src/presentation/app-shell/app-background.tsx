import dotsDesktop from '@/presentation/assets/decor/app/dots-desktop.svg';
import dotsTablet from '@/presentation/assets/decor/app/dots-tablet.svg';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';

// Figma Page background 348:3582, Kind=App, under the main area: Size=Mobile
// (390), Tablet (784, the 1024 layout) and Desktop (1200, the 1440 layout).
// Pieces keep the corner, edge or mid-height they sit at in the frame.
const mobile: readonly DecorPiece[] = [
  {
    kind: 'glow',
    color: 'decor.sky',
    width: 300,
    height: 240,
    blur: 110,
    opacity: 0.35,
    right: -100,
    top: 110,
  },
  {
    kind: 'glow',
    color: 'decor.violet',
    width: 300,
    height: 240,
    blur: 120,
    opacity: 0.25,
    right: -140,
    middle: 18,
  },
  {
    kind: 'glow',
    color: 'decor.mint',
    width: 320,
    height: 220,
    blur: 110,
    opacity: 0.32,
    left: -160,
    bottom: 144,
  },
  { kind: 'circle', color: 'decor.skySoft', size: 120, right: -64, top: 170 },
  {
    kind: 'circle',
    color: 'decor.violetSoft',
    size: 64,
    right: -48,
    middle: 10,
  },
  {
    kind: 'bar',
    color: 'decor.mintSoft',
    width: 140,
    height: 36,
    left: -96,
    bottom: 168,
  },
  {
    kind: 'plus',
    color: 'decor.teal',
    size: 12,
    thickness: 3,
    left: 2,
    bottom: 272,
  },
];

const tablet: readonly DecorPiece[] = [
  {
    kind: 'glow',
    color: 'decor.sky',
    width: 560,
    height: 420,
    blur: 150,
    opacity: 0.45,
    right: -196,
    top: -280,
  },
  {
    kind: 'glow',
    color: 'decor.teal',
    width: 440,
    height: 320,
    blur: 140,
    opacity: 0.28,
    left: 220,
    top: -240,
  },
  {
    kind: 'glow',
    color: 'decor.skySoft',
    width: 340,
    height: 260,
    blur: 130,
    opacity: 0.5,
    right: -96,
    middle: 0,
  },
  {
    kind: 'glow',
    color: 'decor.violet',
    width: 480,
    height: 380,
    blur: 160,
    opacity: 0.35,
    right: -176,
    bottom: -140,
  },
  {
    kind: 'glow',
    color: 'decor.mint',
    width: 460,
    height: 340,
    blur: 150,
    opacity: 0.38,
    left: 200,
    bottom: -140,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 260,
    height: 52,
    right: -66,
    top: -24,
  },
  {
    kind: 'bar',
    color: 'decor.skySoft',
    width: 260,
    height: 52,
    right: -136,
    top: 40,
  },
  {
    kind: 'ring',
    color: 'decor.violet',
    size: 56,
    thickness: 3,
    right: -28,
    top: 132,
  },
  {
    kind: 'circle',
    color: 'decor.violetSoft',
    size: 100,
    right: -60,
    middle: 30,
  },
  {
    kind: 'circle',
    color: 'decor.mintSoft',
    size: 180,
    left: 120,
    bottom: -126,
  },
  {
    kind: 'image',
    src: dotsTablet,
    width: 77,
    height: 23,
    right: 107,
    bottom: 9,
  },
];

const desktop: readonly DecorPiece[] = [
  {
    kind: 'glow',
    color: 'decor.sky',
    width: 640,
    height: 480,
    blur: 170,
    opacity: 0.45,
    right: -220,
    top: -300,
  },
  {
    kind: 'glow',
    color: 'decor.teal',
    width: 520,
    height: 380,
    blur: 150,
    opacity: 0.28,
    left: 300,
    top: -260,
  },
  {
    kind: 'glow',
    color: 'decor.skySoft',
    width: 400,
    height: 300,
    blur: 140,
    opacity: 0.5,
    right: -100,
    middle: 0,
  },
  {
    kind: 'glow',
    color: 'decor.violet',
    width: 560,
    height: 420,
    blur: 170,
    opacity: 0.35,
    right: -200,
    bottom: -160,
  },
  {
    kind: 'glow',
    color: 'decor.mint',
    width: 540,
    height: 400,
    blur: 160,
    opacity: 0.38,
    left: 260,
    bottom: -180,
  },
  {
    kind: 'bar',
    color: 'decor.tealSoft',
    width: 300,
    height: 60,
    right: -60,
    top: -26,
  },
  {
    kind: 'bar',
    color: 'decor.skySoft',
    width: 300,
    height: 60,
    right: -140,
    top: 46,
  },
  {
    kind: 'ring',
    color: 'decor.violet',
    size: 64,
    thickness: 3,
    right: -32,
    top: 136,
  },
  {
    kind: 'plus',
    color: 'decor.teal',
    size: 18,
    thickness: 5,
    right: 11,
    top: 236,
  },
  {
    kind: 'circle',
    color: 'decor.violetSoft',
    size: 120,
    right: -70,
    middle: 30,
  },
  {
    kind: 'circle',
    color: 'decor.mintSoft',
    size: 220,
    left: 150,
    bottom: -162,
  },
  {
    kind: 'ring',
    color: 'decor.teal',
    size: 44,
    thickness: 3,
    left: 420,
    bottom: -16,
  },
  {
    kind: 'image',
    src: dotsDesktop,
    width: 95,
    height: 23,
    right: 125,
    bottom: 11,
  },
];

export function AppBackground() {
  return (
    <>
      <DecorLayer pieces={mobile} display={{ base: 'block', sm: 'none' }} />
      <DecorLayer
        pieces={tablet}
        display={{ base: 'none', sm: 'block', xl: 'none' }}
      />
      <DecorLayer pieces={desktop} display={{ base: 'none', xl: 'block' }} />
    </>
  );
}
