import { Flex, HStack, Text, chakra } from '@chakra-ui/react';
import hamburgerIcon from '@/presentation/assets/icons/hamburger-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { Icon } from '@/presentation/ui/icon';
import { LogoMark } from '@/presentation/ui/logo';

const BarButton = chakra('button', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSize: '11',
    flexShrink: '0',
    borderRadius: 'md',
    cursor: 'pointer',
    _hover: { bg: 'bg.subtle' },
  },
});

// Figma App bar 38:181 on 390: menu, restaurant name, account; name is the
// signed-in user.
export function AppBar({
  onOpenNav,
  onOpenAccount,
  title,
  name,
}: {
  onOpenNav: () => void;
  onOpenAccount: () => void;
  title: string;
  name: string;
}) {
  return (
    <Flex
      as="header"
      display={{ base: 'flex', sm: 'none' }}
      align="center"
      gap="2"
      p="2"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border.default"
    >
      <BarButton
        type="button"
        aria-label="Открыть навигацию"
        aria-haspopup="dialog"
        onClick={onOpenNav}
      >
        <Icon src={hamburgerIcon} size={24} />
      </BarButton>
      <HStack gap="2" flex="1" minW="0">
        <LogoMark />
        <Text textStyle="body.strong" truncate>
          {title}
        </Text>
      </HStack>
      <BarButton
        type="button"
        aria-label={name ? `Учётная запись: ${name}` : 'Учётная запись'}
        aria-haspopup="dialog"
        onClick={onOpenAccount}
      >
        <Icon src={userIcon} size={24} />
      </BarButton>
    </Flex>
  );
}
