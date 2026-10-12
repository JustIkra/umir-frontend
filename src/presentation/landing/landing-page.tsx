import { Box } from '@chakra-ui/react';
import { CookieBanner } from '@/presentation/site/cookie-notice';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { ContactsSection } from './contacts-section';
import { FeaturesSection } from './features-section';
import { FinalCtaSection } from './final-cta-section';
import { HeroSection } from './hero-section';
import { PrinciplesSection } from './principles-section';
import { ProcessSection } from './process-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function LandingPage() {
  return (
    <>
      <title>Ровный ход — склад и заказы ресторана</title>
      <SkipLink />
      <SiteHeader />
      <Box
        as="main"
        id={mainContentId}
        tabIndex={-1}
        bg="bg.canvas"
        _focusVisible={{ outline: 'none' }}
      >
        <HeroSection />
        <FeaturesSection />
        <ProcessSection />
        <PrinciplesSection />
        <ContactsSection />
        <FinalCtaSection />
      </Box>
      <SiteFooter />
      <CookieBanner />
    </>
  );
}
