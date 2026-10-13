import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useId, type ReactNode } from 'react';
import { TextAnchor, TextLink } from '@/presentation/ui/actions';
import { Wordmark } from '@/presentation/ui/logo';
import { documentLinks } from '@/presentation/documents/links';
import { landingSections } from './sections';

function Column({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <chakra.nav
      aria-labelledby={titleId}
      w={{ base: 'full', md: '15rem' }}
      flexShrink="0"
    >
      <Text id={titleId} textStyle="caption.strong" color="text.secondary">
        {title}
      </Text>
      <Stack as="ul" gap="2" mt="2" listStyleType="none">
        {children}
      </Stack>
    </chakra.nav>
  );
}

// Figma Site footer 50:412.
export function SiteFooter() {
  return (
    <chakra.footer
      px={{ base: '4', md: '10', xl: '30' }}
      pt="calc({spacing.8} - 1px)"
      pb="8"
      bg="bg.surface"
      borderTopWidth="1px"
      borderColor="border.default"
    >
      <Flex direction={{ base: 'column', md: 'row' }} gap="8">
        <Stack gap="3" flex="1" minW="0">
          <Wordmark />
          <Text textStyle="body.default" color="text.secondary">
            Учёт продуктов, меню и заказов для единого учёта складской логистики
            организации.
          </Text>
        </Stack>
        <Column title="Продукт">
          {landingSections.map((section) => (
            <li key={section.id}>
              <TextAnchor href={`#${section.id}`}>{section.title}</TextAnchor>
            </li>
          ))}
          <li>
            <TextLink to="/login">Открыть приложение</TextLink>
          </li>
        </Column>
        <Column title="Документы">
          {documentLinks.map((document) => (
            <li key={document.path}>
              <TextLink to={document.path}>{document.title}</TextLink>
            </li>
          ))}
        </Column>
      </Flex>
      <Text mt="8" textStyle="caption.default" color="text.secondary">
        © 2026 «Ровный ход».
      </Text>
    </chakra.footer>
  );
}
