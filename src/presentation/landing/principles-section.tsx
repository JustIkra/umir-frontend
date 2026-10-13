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
    title: 'Успех — только по ответу сервера',
    text: 'Если связь оборвалась, сервис покажет, что результат неизвестен, и поможет проверить ту же попытку без повторной продажи.',
  },
  {
    accent: 'decor.sky',
    title: 'Точные количества',
    text: 'Граммы, миллилитры и штуки до тысячных. Большие значения не округляются и не теряют разряды.',
  },
  {
    accent: 'decor.violet',
    title: 'Полные дата и время',
    text: 'Сроки и события — с датой и временем в часовом поясе организации. Скрытой полуночи и локального обратного отсчёта нет.',
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
          title="На чём держится доверие к цифрам"
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
