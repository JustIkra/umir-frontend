import {
  Box,
  chakra,
  type BoxProps,
  type SystemStyleObject,
} from '@chakra-ui/react';
import { rem } from './units';

type Horizontal = { left: number } | { right: number } | { center: number };
type Vertical = { top: number } | { bottom: number } | { middle: number };

type Shape =
  | { kind: 'image'; src: string; width: number; height: number }
  | {
      kind: 'bar';
      color: string;
      width: number;
      height: number;
      shadow?: string;
    }
  | { kind: 'plus'; color: string; size: number; thickness: number }
  | { kind: 'circle'; color: string; size: number }
  | { kind: 'ring'; color: string; size: number; thickness: number }
  // Figma layer blur: CSS blur takes half the Figma radius.
  | {
      kind: 'glow';
      color: string;
      width: number;
      height: number;
      blur: number;
    };

export type DecorPiece = Shape &
  Horizontal &
  Vertical & {
    // Extra styles for entrance animation on the landing hero.
    css?: SystemStyleObject;
  };

// `center` and `middle` offsets are measured from the middle of the section.
function position(piece: DecorPiece): BoxProps {
  const props: BoxProps = { position: 'absolute' };
  let shiftX = '0';
  let shiftY = '0';
  if ('left' in piece) props.left = rem(piece.left);
  else if ('right' in piece) props.right = rem(piece.right);
  else {
    props.left = `calc(50% + ${rem(piece.center)})`;
    shiftX = '-50%';
  }
  if ('top' in piece) props.top = rem(piece.top);
  else if ('bottom' in piece) props.bottom = rem(piece.bottom);
  else {
    props.top = `calc(50% + ${rem(piece.middle)})`;
    shiftY = '-50%';
  }
  if (shiftX !== '0' || shiftY !== '0') props.translate = `${shiftX} ${shiftY}`;
  return props;
}

function Piece({ piece }: { piece: DecorPiece }) {
  const box = { ...position(piece), css: piece.css };
  switch (piece.kind) {
    case 'image':
      return (
        <chakra.img
          {...box}
          src={piece.src}
          alt=""
          htmlWidth={piece.width}
          htmlHeight={piece.height}
          w={rem(piece.width)}
          h={rem(piece.height)}
          maxW="none"
        />
      );
    case 'bar':
      return (
        <Box
          {...box}
          w={rem(piece.width)}
          h={rem(piece.height)}
          bg={piece.color}
          borderRadius="full"
          boxShadow={piece.shadow}
        />
      );
    case 'circle':
      return (
        <Box
          {...box}
          boxSize={rem(piece.size)}
          bg={piece.color}
          borderRadius="full"
        />
      );
    case 'ring':
      return (
        <Box
          {...box}
          boxSize={rem(piece.size)}
          borderWidth={rem(piece.thickness)}
          borderStyle="solid"
          borderColor={piece.color}
          borderRadius="full"
        />
      );
    case 'glow':
      return (
        <Box
          {...box}
          w={rem(piece.width)}
          h={rem(piece.height)}
          bg={piece.color}
          borderRadius="full"
          filter={`blur(${rem(piece.blur / 2)})`}
        />
      );
    case 'plus': {
      const offset = rem((piece.size - piece.thickness) / 2);
      const stroke: BoxProps = {
        position: 'absolute',
        bg: piece.color,
        borderRadius: rem(piece.thickness / 2),
      };
      return (
        <Box {...box} boxSize={rem(piece.size)}>
          <Box
            {...stroke}
            left="0"
            top={offset}
            w="full"
            h={rem(piece.thickness)}
          />
          <Box
            {...stroke}
            top="0"
            left={offset}
            h="full"
            w={rem(piece.thickness)}
          />
        </Box>
      );
    }
  }
}

// Decorative layer under page content (Figma Page background 348:3582 and the
// landing sections). It never takes pointer events and disappears when the
// visitor asks for more contrast or uses forced colors.
export function DecorLayer({
  pieces,
  ...props
}: { pieces: readonly DecorPiece[] } & BoxProps) {
  return (
    <Box
      aria-hidden="true"
      position="absolute"
      inset="0"
      overflow="clip"
      pointerEvents="none"
      zIndex="decor"
      css={{
        '@media (forced-colors: active), (prefers-contrast: more)': {
          display: 'none',
        },
      }}
      {...props}
    >
      {pieces.map((piece, index) => (
        <Piece key={index} piece={piece} />
      ))}
    </Box>
  );
}
