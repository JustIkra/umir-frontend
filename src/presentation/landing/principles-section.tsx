import { Grid, Stack, Text } from '@chakra-ui/react';
import desktopGlow from '@/presentation/assets/decor/principles/desktop-glow.svg';
import tabletGlow from '@/presentation/assets/decor/principles/tablet-glow.svg';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';
import { LandingSection, SectionContent, SectionHead } from './section';

// Figma «Принципы» 58:499 (1440), 59:863 (1024) and 61:1061 (390, no decor).
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: desktopGlow,
    width: 920,
    height: 720,
    right: -280,
    top: -260,
  },
];
const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlow,
    width: 780,
    height: 640,
    right: -240,
    top: -240,
  },
];

const principles = [
  {
    accent: 'decor.teal',
    title: 'Заказ засчитан, только когда точно прошёл',
    text: 'Если пропала связь, мы честно скажем, что результат пока неизвестен, и поможем проверить заказ, не продав блюдо дважды.',
  },
  {
    accent: 'decor.sky',
    title: 'Точные количества',
    text: 'Граммы, миллилитры и штуки считаем точно, без округлений — даже в больших числах.',
  },
  {
    accent: 'decor.violet',
    title: 'Точные дата и время',
    text: 'Сроки и события показываем с датой и временем по часовому поясу вашей организации.',
  },
] as const;

export function PrinciplesSection() {
  const id = 'principles';
  return (
    <LandingSection id={id}>
      <DecorLayer
        pieces={tabletDecor}
        display={{ base: 'none', sm: 'block', xl: 'none' }}
      />
      <DecorLayer
        pieces={desktopDecor}
        display={{ base: 'none', xl: 'block' }}
      />
      <SectionContent>
        <SectionHead
          id={id}
          eyebrow="Принципы"
          title="Почему нашим цифрам можно верить"
        />
        <Grid
          templateColumns={{ base: '1fr', sm: 'repeat(3, 1fr)' }}
          gap={{ base: '2', sm: '6', xl: '8' }}
        >
          {principles.map((principle) => (
            <Stack
              key={principle.title}
              as="article"
              gap="3"
              // Figma draws the accent line inside the 24px top padding.
              pt="calc({spacing.6} - 4px)"
              pb="6"
              borderTopWidth="4px"
              borderColor={principle.accent}
            >
              <Text as="h3" textStyle="heading.h3">
                {principle.title}
              </Text>
              <Text textStyle="body.default" color="text.secondary">
                {principle.text}
              </Text>
            </Stack>
          ))}
        </Grid>
      </SectionContent>
    </LandingSection>
  );
}
