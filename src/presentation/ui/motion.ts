import type { SystemStyleObject } from '@chakra-ui/react';
import { rem } from './units';

// One-time entrance from the landing motion spec (Figma Motion, 12.10.2026):
// opacity plus a translate offset, eased with motion/easing/enter. Reduced
// motion jumps to the final state through the global stylesheet.
export function enterMotion({
  delay,
  duration,
  x = 0,
  y = 0,
}: {
  delay: number;
  duration: number;
  x?: number;
  y?: number;
}): SystemStyleObject {
  return {
    '--rise-x': rem(x),
    '--rise-y': rem(y),
    animation: `rise ${String(duration)}s {easings.enter} ${String(delay)}s both`,
  };
}
