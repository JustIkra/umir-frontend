import { Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import arrowLeftIcon from '@/presentation/assets/icons/arrow-left-24.svg';
import { TextLink } from '@/presentation/ui/actions';
import { Icon } from '@/presentation/ui/icon';
import { Wordmark } from '@/presentation/ui/logo';
import { rem } from '@/presentation/ui/units';

// Figma Doc header 21:24. The plain variant («Навигация документа» off) serves
// pages outside the document set, such as «Страница не найдена»: only the
// logo, at the same height.
export function DocumentHeader({
  variant = 'document',
}: {
  variant?: 'document' | 'plain';
}) {
  const documentPage = variant === 'document';
  return (
    <Flex
      as="header"
      align="center"
      justify="space-between"
      gap="4"
      minH={{ base: rem(64), md: rem(72) }}
      px={{ base: '4', md: '8' }}
      pt={{ base: '3', md: '4' }}
      pb={{ base: 'calc({spacing.3} - 1px)', md: 'calc({spacing.4} - 1px)' }}
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border.default"
    >
      <HStack gap="2">
        <RouterLink to="/" aria-label="Ровный ход — главная">
          <Wordmark />
        </RouterLink>
        {documentPage && (
          <Text
            as="span"
            display={{ base: 'none', md: 'inline' }}
            textStyle="body.default"
            color="text.secondary"
            whiteSpace="nowrap"
          >
            / Документы
          </Text>
        )}
      </HStack>
      {documentPage && (
        <TextLink
          to="/login"
          size="label"
          display="inline-flex"
          alignItems="center"
          gap="2"
          px="1"
          py="2"
          whiteSpace="nowrap"
        >
          <Icon src={arrowLeftIcon} size={24} />
          <chakra.span display={{ base: 'none', md: 'inline' }}>
            Вернуться в приложение
          </chakra.span>
          <chakra.span display={{ base: 'inline', md: 'none' }}>
            В приложение
          </chakra.span>
        </TextLink>
      )}
    </Flex>
  );
}

const footerLinks = [
  { to: '/privacy', title: 'Политика конфиденциальности' },
  { to: '/cookies', title: 'Политика обработки cookie' },
] as const;

// Figma Doc footer 21:35.
export function DocumentFooter() {
  return (
    <Flex
      as="footer"
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'flex-start', md: 'center' }}
      justify="flex-start"
      columnGap="6"
      rowGap="3"
      px={{ base: '4', md: '8' }}
      pt="calc({spacing.6} - 1px)"
      pb="6"
      bg="bg.surface"
      borderTopWidth="1px"
      borderColor="border.default"
    >
      <Text textStyle="caption.default" color="text.secondary">
        © 2026 «Ровный ход» — склад, меню и заказы ваших ресторанов в одном
        месте.
      </Text>
      <chakra.nav aria-label="Документы">
        <Stack
          as="ul"
          listStyleType="none"
          textStyle="caption.default"
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: '2', md: '6' }}
        >
          {footerLinks.map((link) => (
            <li key={link.to}>
              <TextLink to={link.to} size="caption" whiteSpace="nowrap">
                {link.title}
              </TextLink>
            </li>
          ))}
        </Stack>
      </chakra.nav>
    </Flex>
  );
}
