import { chakra } from '@chakra-ui/react';
import { NavLink } from 'react-router';
import { SegmentBar, segmentItem } from './segment';

const Tab = chakra(NavLink, { base: segmentItem });

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
    <SegmentBar
      as="nav"
      aria-label={label}
      alignSelf={{ base: 'stretch', sm: 'flex-start' }}
    >
      {tabs.map((tab) => (
        <Tab key={tab.to} to={tab.to} end>
          {tab.title}
        </Tab>
      ))}
    </SegmentBar>
  );
}
