// Figma measurements are in pixels at the 16px root size; layout uses rem.
export const rem = (px: number) => `${String(px / 16)}rem`;
