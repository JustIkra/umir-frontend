import { Box, HStack, Text, type BoxProps } from '@chakra-ui/react';

const bar: BoxProps = {
  position: 'absolute',
  bg: 'text.onAction',
  borderRadius: '7%/14%',
};

// Figma Logo/Mark 46:348, shape Rounded: two equal bars, the top one shifted right.
export function LogoMark({ boxSize = '7' }: Pick<BoxProps, 'boxSize'>) {
  return (
    <Box
      aria-hidden="true"
      position="relative"
      flexShrink="0"
      boxSize={boxSize}
      bg="bg.action"
      borderRadius="25%"
    >
      <Box {...bar} inset="32.81% 18.75% 53.13% 29.69%" />
      <Box {...bar} inset="53.13% 29.69% 32.81% 18.75%" />
    </Box>
  );
}

export function Wordmark() {
  return (
    <HStack gap="2">
      <LogoMark />
      <Text as="span" textStyle="body.strong" whiteSpace="nowrap">
        Ровный ход
      </Text>
    </HStack>
  );
}
