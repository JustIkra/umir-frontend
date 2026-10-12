import { chakra, type HTMLChakraProps } from '@chakra-ui/react';
import { rem } from './units';

// Decorative SVG icon exported from Figma. Width and height stay HTML attributes;
// the rendered size follows the root font size.
export function Icon({
  src,
  size,
  ...props
}: { src: string; size: number } & Omit<HTMLChakraProps<'img'>, 'src'>) {
  return (
    <chakra.img
      src={src}
      alt=""
      htmlWidth={size}
      htmlHeight={size}
      boxSize={rem(size)}
      flexShrink="0"
      {...props}
    />
  );
}
