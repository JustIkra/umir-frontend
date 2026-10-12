import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { CookieBanner } from '@/presentation/site/cookie-notice';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { TextLink } from '@/presentation/ui/actions';
import {
  cookieRows,
  documentEdition,
  type DocumentBlock,
  type DocumentSection,
  type LegalDocument,
} from './content';
import { CookieTable } from './cookie-table';
import { DocumentBackground } from './document-background';
import { DocumentFooter, DocumentHeader } from './document-chrome';
import { TableOfContents, TableOfContentsToggle } from './table-of-contents';

function Breadcrumbs({ current }: { current: string }) {
  const separator = (
    <Text as="span" aria-hidden="true" color="text.disabled">
      /
    </Text>
  );
  return (
    <chakra.nav aria-label="Навигационная цепочка">
      <Flex
        as="ol"
        wrap="wrap"
        align="center"
        columnGap="2"
        rowGap="1"
        listStyleType="none"
        textStyle="caption.default"
      >
        <Flex as="li" gap="2">
          <TextLink
            to="/"
            size="inherit"
            color="text.secondary"
            _hover={{ color: 'text.primary' }}
          >
            Ровный ход
          </TextLink>
          {separator}
        </Flex>
        <Flex as="li" gap="2" color="text.secondary">
          Документы
          {separator}
        </Flex>
        <li aria-current="page">{current}</li>
      </Flex>
    </chakra.nav>
  );
}

// Items are numbered within a section; the cookie table between them is not.
function itemNumbers(blocks: readonly DocumentBlock[]): number[] {
  return blocks.map(
    (_, index) =>
      blocks.slice(0, index + 1).filter((block) => block.kind === 'item')
        .length,
  );
}

function Section({
  section,
  number,
}: {
  section: DocumentSection;
  number: number;
}) {
  const numbers = itemNumbers(section.blocks);
  return (
    <Stack
      as="section"
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      gap="3"
      scrollMarginTop="6"
    >
      <chakra.h2
        id={`${section.id}-title`}
        textStyle={{ base: 'heading.h3', md: 'heading.h2' }}
      >
        {number}. {section.title}
      </chakra.h2>
      {section.blocks.map((block, index) =>
        block.kind === 'cookieTable' ? (
          <CookieTable key={index} rows={cookieRows} />
        ) : (
          <Flex key={index} gap="3" textStyle="body.default">
            <Text
              as="span"
              textStyle="body.strong"
              w={{ base: '10', md: '2.75rem' }}
              flexShrink="0"
            >
              {number}.{numbers[index]}.
            </Text>
            <Stack gap="1" flex="1" minW="0" align="flex-start">
              <Text>{block.text}</Text>
              {block.link && (
                <TextLink to={block.link.to}>{block.link.text}</TextLink>
              )}
            </Stack>
          </Flex>
        ),
      )}
    </Stack>
  );
}

// Figma Templates: privacy policy, cookie policy and personal data consent at
// 1440 / 1024 / 390.
export function DocumentPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <title>{`${document.title} — Ровный ход`}</title>
      <SkipLink />
      <DocumentHeader />
      <Box position="relative" bg="bg.canvas" overflow="clip">
        <DocumentBackground />
        <Flex
          position="relative"
          zIndex="content"
          justify="center"
          gap={{ md: '10', xl: '16' }}
          px={{ base: '4', md: '10' }}
          pt={{ base: '6', md: '12' }}
          pb={{ base: '12', md: '24' }}
        >
          <Box
            display={{ base: 'none', md: 'block' }}
            w={{ md: '15rem', xl: '18rem' }}
            flexShrink="0"
          >
            <Box position="sticky" top="6">
              <TableOfContents sections={document.sections} />
            </Box>
          </Box>
          <Stack
            as="main"
            id={mainContentId}
            tabIndex={-1}
            gap={{ base: '6', md: '8' }}
            flex="1"
            minW="0"
            maxW={{ md: '45rem' }}
            _focusVisible={{ outline: 'none' }}
          >
            <Stack gap="3">
              <Breadcrumbs current={document.title} />
              <chakra.h1 textStyle="heading.h1">{document.title}</chakra.h1>
              <Text textStyle="caption.default" color="text.secondary">
                {documentEdition}
              </Text>
            </Stack>
            <Box h="1px" bg="border.default" />
            <Box display={{ base: 'block', md: 'none' }}>
              <TableOfContentsToggle sections={document.sections} />
            </Box>
            <Text textStyle="body.lead" color="text.secondary">
              {document.lead}
            </Text>
            <Text
              px="4"
              py="3"
              bg="bg.subtle"
              borderRadius="md"
              textStyle="caption.default"
            >
              {document.templateNote}
            </Text>
            {document.sections.map((section, index) => (
              <Section key={section.id} section={section} number={index + 1} />
            ))}
            <Stack
              as="address"
              gap="2"
              p="6"
              bg="bg.surface"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="md"
              fontStyle="normal"
              textStyle="body.default"
            >
              <Text as="h2" textStyle="heading.h3">
                Контакты оператора
              </Text>
              {document.contacts.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </Stack>
          </Stack>
        </Flex>
      </Box>
      <DocumentFooter />
      <CookieBanner />
    </>
  );
}
