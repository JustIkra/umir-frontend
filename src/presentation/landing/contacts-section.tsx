import { Grid } from '@chakra-ui/react';
import desktopGlowLeft from '@/presentation/assets/decor/contacts/desktop-glow-left.svg';
import desktopGlowRight from '@/presentation/assets/decor/contacts/desktop-glow-right.svg';
import mobileGlowBottom from '@/presentation/assets/decor/contacts/mobile-glow-bottom.svg';
import mobileGlowTop from '@/presentation/assets/decor/contacts/mobile-glow-top.svg';
import tabletGlowLeft from '@/presentation/assets/decor/contacts/tablet-glow-left.svg';
import tabletGlowRight from '@/presentation/assets/decor/contacts/tablet-glow-right.svg';
import { DecorLayer, type DecorPiece } from '@/presentation/ui/decor';
import { FeedbackForm } from './feedback-form';
import { OfficeMap } from './office-map';
import { LandingSection, SectionContent, SectionHead } from './section';

// Figma «Контакты» 210:1639 (1440), 211:48499 (1024) and 211:48617 (390).
const desktopDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: desktopGlowLeft,
    width: 980,
    height: 840,
    left: -380,
    top: -60,
  },
  {
    kind: 'image',
    src: desktopGlowRight,
    width: 980,
    height: 840,
    right: -340,
    bottom: -240,
  },
];
const tabletDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: tabletGlowLeft,
    width: 840,
    height: 740,
    left: -340,
    top: -40,
  },
  {
    kind: 'image',
    src: tabletGlowRight,
    width: 840,
    height: 740,
    right: -300,
    bottom: -172,
  },
];
const mobileDecor: readonly DecorPiece[] = [
  {
    kind: 'image',
    src: mobileGlowTop,
    width: 620,
    height: 560,
    left: -280,
    top: 60,
  },
  {
    kind: 'image',
    src: mobileGlowBottom,
    width: 620,
    height: 560,
    right: -290,
    bottom: -62,
  },
];

export function ContactsSection() {
  const id = 'contacts';
  return (
    <LandingSection id={id}>
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
          eyebrow="Контакты"
          title="Напишите нам"
          lead="Вопрос о подключении, данных или работе сервиса — ответим на email."
          wide
        />
        <Grid
          templateColumns={{
            base: '1fr',
            sm: 'minmax(0, 484fr) minmax(0, 420fr)',
            xl: 'minmax(0, 592fr) minmax(0, 528fr)',
          }}
          gap={{ base: '6', sm: '10', xl: '20' }}
          alignItems="start"
        >
          <FeedbackForm />
          <OfficeMap />
        </Grid>
      </SectionContent>
    </LandingSection>
  );
}
