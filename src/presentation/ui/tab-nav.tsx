import { Flex, chakra } from '@chakra-ui/react';
import { NavLink } from 'react-router';

const Tab = chakra(NavLink, {
  base: {
    display: 'flex',
    alignItems: 'center',
    px: 'calc({spacing.3} - 1px)',
    py: 'calc({spacing.1.5} - 1px)',
    borderWidth: '1px',
    borderColor: 'transparent',
    borderRadius: 'sm',
    textStyle: 'caption.default',
    color: 'text.secondary',
    _hover: { color: 'text.primary' },
    _currentPage: {
      bg: 'bg.surface',
      borderColor: 'border.strong',
      textStyle: 'caption.strong',
      color: 'text.primary',
    },
  },
});

// Figma Segment 37:150 as page navigation: every tab is its own address, so
// the tabs are links in <nav> with aria-current, not an ARIA tablist.
export function TabNav({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly { to: string; title: string }[];
}) {
  return (
    <Flex
      as="nav"
      aria-label={label}
      alignSelf={{ base: 'stretch', sm: 'flex-start' }}
      wrap="wrap"
      gap="1"
      p="1"
      bg="bg.subtle"
      borderRadius="md"
    >
      {tabs.map((tab) => (
        <Tab key={tab.to} to={tab.to} end>
          {tab.title}
        </Tab>
      ))}
    </Flex>
  );
}
