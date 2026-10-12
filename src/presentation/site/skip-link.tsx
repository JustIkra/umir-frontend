import { chakra } from '@chakra-ui/react';

export const mainContentId = 'main';

// Figma Skip link 202:3141 (ГОСТ Р 52872-2019, WCAG 2.4.1): the first Tab stop,
// visually hidden until focused, then shown over the header.
export function SkipLink() {
  return (
    <chakra.a
      href={`#${mainContentId}`}
      position="fixed"
      top="3"
      left="4"
      zIndex="skipLink"
      px="4"
      py="3"
      bg="bg.surface"
      borderWidth="2px"
      borderColor="border.focus"
      borderRadius="md"
      textStyle="label.default"
      color="text.primary"
      textDecoration="underline"
      textUnderlinePosition="from-font"
      whiteSpace="nowrap"
      transform="translateY(calc(-100% - {spacing.6}))"
      // The shadow appears only on focus; off-screen it would bleed into view.
      _focus={{ transform: 'none', boxShadow: 'overlay' }}
      _focusVisible={{ outline: 'none' }}
      onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById(mainContentId);
        main?.focus();
        main?.scrollIntoView();
      }}
    >
      Перейти к основному содержанию
    </chakra.a>
  );
}
