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

// Single-colour Figma icon that follows the text colour (navigation states).
export function MaskIcon({
  src,
  size,
  ...props
}: { src: string; size: number } & HTMLChakraProps<'span'>) {
  return (
    <chakra.span
      aria-hidden="true"
      display="inline-block"
      flexShrink="0"
      boxSize={rem(size)}
      bg="currentColor"
      css={{
        maskImage: `url("${src}")`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
      }}
      {...props}
    />
  );
}
