import { Flex, HStack, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { ButtonLink } from '@/presentation/ui/actions';
import { enterMotion } from '@/presentation/ui/motion';
import { Wordmark } from '@/presentation/ui/logo';
import { landingSections } from './sections';

// Figma Site header 50:371: Desktop from tablet width, Mobile below.
export function SiteHeader() {
  return (
    <Flex
      as="header"
      align="center"
      justify="space-between"
      gap="6"
      px={{ base: '4', md: '8' }}
      pt="3"
      pb="calc({spacing.3} - 1px)"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border.default"
      position="relative"
      zIndex="content"
      css={enterMotion({ delay: 0, duration: 0.4, y: -12 })}
    >
      <RouterLink to="/" aria-label="Ровный ход — главная">
        <Wordmark />
      </RouterLink>
      <chakra.nav
        aria-label="Разделы страницы"
        display={{ base: 'none', md: 'block' }}
      >
        <HStack as="ul" gap="8" listStyleType="none">
          {landingSections.map((section) => (
            <li key={section.id}>
              <chakra.a
                href={`#${section.id}`}
                textStyle="body.default"
                color="text.primary"
                whiteSpace="nowrap"
                borderRadius="sm"
                _hover={{
                  textDecoration: 'underline',
                  textUnderlinePosition: 'from-font',
                }}
              >
                {section.title}
              </chakra.a>
            </li>
          ))}
        </HStack>
      </chakra.nav>
      <ButtonLink to="/login" aria-label="Открыть приложение">
        <chakra.span display={{ base: 'none', md: 'inline' }}>
          Открыть приложение
        </chakra.span>
        <chakra.span display={{ base: 'inline', md: 'none' }}>
          Открыть
        </chakra.span>
      </ButtonLink>
    </Flex>
  );
}
