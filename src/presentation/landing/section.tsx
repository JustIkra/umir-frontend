import { Stack, Text, chakra, type HTMLChakraProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

// Shared rhythm of the landing sections in Figma: 1440 → 96px vertical padding
// and 48px before content, 1024 → 80/40, 390 → 64/32.
export function LandingSection({
  id,
  children,
  ...props
}: { id: string; children: ReactNode } & HTMLChakraProps<'section'>) {
  return (
    <chakra.section
      id={id}
      aria-labelledby={`${id}-title`}
      position="relative"
      overflow="clip"
      scrollMarginTop="0"
      py={{ base: '16', sm: '20', xl: '24' }}
      {...props}
    >
      {children}
    </chakra.section>
  );
}

export function SectionContent({ children }: { children: ReactNode }) {
  return (
    <Stack
      position="relative"
      zIndex="content"
      gap={{ base: '8', sm: '10', xl: '12' }}
      maxW="80rem"
      mx="auto"
      px={{ base: '4', sm: '10' }}
    >
      {children}
    </Stack>
  );
}

export function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  wide = false,
  inverse = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  wide?: boolean;
  inverse?: boolean;
}) {
  return (
    <Stack
      gap={{ base: '2', sm: '3' }}
      maxW={{ sm: wide ? undefined : '45rem', xl: '47.5rem' }}
    >
      <Text
        textStyle="caption.strong"
        color={inverse ? 'text.onInverseSecondary' : 'text.action'}
      >
        {eyebrow}
      </Text>
      <chakra.h2
        id={`${id}-title`}
        textStyle={{ base: 'heading.h2', sm: 'display.l' }}
        color={inverse ? 'text.onInverse' : undefined}
      >
        {title}
      </chakra.h2>
      {lead && (
        <Text
          textStyle={{ base: 'body.default', sm: 'body.lead' }}
          color="text.secondary"
        >
          {lead}
        </Text>
      )}
    </Stack>
  );
}
