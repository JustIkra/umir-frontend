import { Flex, Grid, Stack, Text } from '@chakra-ui/react';
import desktopGlowLeft from '@/presentation/assets/decor/steps/desktop-glow-left.svg';
import desktopGlowRight from '@/presentation/assets/decor/steps/desktop-glow-right.svg';
import mobileGlowLeft from '@/presentation/assets/decor/steps/mobile-glow-left.svg';
import mobileGlowRight from '@/presentation/assets/decor/steps/mobile-glow-right.svg';
import tabletGlowLeft from '@/presentation/assets/decor/steps/tablet-glow-left.svg';
import tabletGlowRight from '@/presentation/assets/decor/steps/tablet-glow-right.svg';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';
import { LandingSection, SectionContent, SectionHead } from './section';

// Figma «Как это работает» 58:474 (1440), 59:837 (1024) and 61:1036 (390).
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: desktopGlowLeft,
    width: 1000,
    height: 820,
    left: -360,
    top: 72,
  },
  {
    kind: 'image',
    src: desktopGlowRight,
    width: 1000,
    height: 820,
    right: -260,
    top: -380,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 340,
    height: 72,
    right: -40,
    top: 56,
  },
  {
    kind: 'bar',
    color: 'decor.sky',
    width: 340,
    height: 72,
    right: -120,
    top: 148,
  },
];
const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlowLeft,
    width: 840,
    height: 720,
    left: -320,
    top: 248,
  },
  {
    kind: 'image',
    src: tabletGlowRight,
    width: 840,
    height: 720,
    right: -260,
    top: -340,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 320,
    height: 64,
    right: -60,
    top: 56,
  },
  {
    kind: 'bar',
    color: 'decor.sky',
    width: 320,
    height: 64,
    right: -130,
    top: 136,
  },
];
const mobileDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlowLeft,
    width: 600,
    height: 540,
    left: -270,
    bottom: -90,
  },
  {
    kind: 'image',
    src: mobileGlowRight,
    width: 580,
    height: 520,
    right: -260,
    middle: 50,
  },
  {
    kind: 'bar',
    color: 'decor.teal',
    width: 180,
    height: 44,
    right: -90,
    bottom: 26,
  },
  {
    kind: 'bar',
    color: 'decor.sky',
    width: 180,
    height: 44,
    right: -30,
    bottom: -14,
  },
];

const steps = [
  {
    color: 'decor.tealSoft',
    title: 'Заведите справочники',
    text: 'Продукты с базовой единицей и блюда с рецептурой одной порции.',
  },
  {
    color: 'decor.skySoft',
    title: 'Принимайте поставки',
    text: 'Каждая строка поставки становится партией со своим сроком годности.',
  },
  {
    color: 'decor.violetSoft',
    title: 'Соберите заказ',
    text: 'Сервис предложит точный состав: что можно приготовить, что сократить и почему.',
  },
  {
    color: 'decor.mintSoft',
    title: 'Подтвердите состав',
    text: 'Списание по FEFO записывается только после ответа сервера. Неизвестный исход не выдаётся за продажу.',
  },
] as const;

export function ProcessSection() {
  const id = 'how-it-works';
  return (
    <LandingSection id={id} bg="bg.inverse">
      <DecorLayer
        pieces={mobileDecor}
        display={{ base: 'block', sm: 'none' }}
      />
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
          eyebrow="Как это работает"
          title="Четыре шага от поставки до продажи"
          inverse
        />
        <Grid
          as="ol"
          listStyleType="none"
          templateColumns={{ base: '1fr', sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }}
          columnGap="6"
          rowGap={{ base: '3', sm: '10', xl: '6' }}
        >
          {steps.map((step, index) => (
            <Stack
              as="li"
              key={step.title}
              gap="3"
              p={{ base: '5', sm: '6' }}
              minH={{ sm: '11.5rem', xl: '14.5rem' }}
              bg="bg.surface"
              borderRadius="md"
            >
              <Flex
                boxSize="2.25rem"
                align="center"
                justify="center"
                bg={step.color}
                borderRadius="full"
                textStyle="body.strong"
              >
                {index + 1}
              </Flex>
              <Text as="h3" textStyle="heading.h3">
                {step.title}
              </Text>
              <Text textStyle="body.default" color="text.secondary">
                {step.text}
              </Text>
            </Stack>
          ))}
        </Grid>
      </SectionContent>
    </LandingSection>
  );
}
