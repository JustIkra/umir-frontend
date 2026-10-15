import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import chevronDownIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import { Icon } from '@/presentation/ui/icon';
import { activeSectionIndex, sectionActivationPoints } from './active-section';
import type { DocumentSection } from './content';

const scrollKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

// A section chosen from the table of contents or the address. It counts as
// reached once the scroll stops at it, and released when the reader scrolls
// away; small layout shifts, such as late fonts, keep it.
interface Pin {
  id: string;
  arrived: boolean;
}

// How far the page is from the position where the browser brings the section:
// its top minus the scroll margin and the root scroll padding, within the
// scrollable range. Measured anew each time, because the layout can shift.
function distanceToSection(id: string): number {
  const element = document.getElementById(id);
  if (!element) return Infinity;
  const root = document.documentElement;
  const offset =
    (parseFloat(getComputedStyle(element).scrollMarginTop) || 0) +
    (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0);
  const maxScroll = root.scrollHeight - window.innerHeight;
  const top = element.getBoundingClientRect().top + window.scrollY - offset;
  return Math.abs(window.scrollY - Math.min(Math.max(0, top), maxScroll));
}

// Scroll positions may be fractional at some zoom levels.
const pinSection = (id: string): Pin => ({
  id,
  arrived: distanceToSection(id) <= 2,
});

// Highlights the section being read: the last one whose top passed the upper
// 30% of the viewport. A chosen section stays highlighted until the reader
// scrolls away, even when the page cannot bring it to the top.
function useActiveSection(sections: readonly DocumentSection[]) {
  const { hash } = useLocation();
  const [active, setActive] = useState(sections[0]?.id);
  const pin = useRef<Pin | undefined>(undefined);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const chosen = pin.current;
      if (chosen) {
        const distance = distanceToSection(chosen.id);
        if (!chosen.arrived) chosen.arrived = distance <= 2;
        const away = chosen.arrived && distance > window.innerHeight * 0.1;
        if (distance !== Infinity && !away) {
          setActive(chosen.id);
          return;
        }
        pin.current = undefined;
      }
      const tops = sections.map(
        (section) =>
          (document.getElementById(section.id)?.getBoundingClientRect().top ??
            0) + window.scrollY,
      );
      const points = sectionActivationPoints(
        tops,
        window.innerHeight * 0.3,
        document.documentElement.scrollHeight - window.innerHeight,
        window.innerHeight * 0.15,
      );
      setActive(sections[activeSectionIndex(points, window.scrollY)]?.id);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const release = () => {
      pin.current = undefined;
      schedule();
    };
    const releaseOnKey = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key)) release();
    };

    const linked = sections.find((section) => `#${section.id}` === hash);
    if (linked) pin.current = pinSection(linked.id);
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('pointerdown', release);
    window.addEventListener('keydown', releaseOnKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('pointerdown', release);
      window.removeEventListener('keydown', releaseOnKey);
    };
  }, [sections, hash]);

  const select = (id: string) => {
    pin.current = pinSection(id);
    setActive(id);
  };
  return [active, select] as const;
}

function TocList({
  sections,
  active,
  onSelect,
}: {
  sections: readonly DocumentSection[];
  active: string | undefined;
  onSelect?: (id: string) => void;
}) {
  return (
    <Flex as="ol" direction="column" gap="1" listStyleType="none">
      {sections.map((section, index) => {
        const current = section.id === active;
        return (
          <li key={section.id}>
            <chakra.a
              href={`#${section.id}`}
              aria-current={current ? 'location' : undefined}
              onClick={() => {
                onSelect?.(section.id);
              }}
              display="flex"
              gap="3"
              px="3"
              py="2"
              borderRadius="md"
              textStyle={current ? 'label.default' : 'body.default'}
              color={current ? 'text.action' : 'text.primary'}
              bg={current ? 'bg.actionSubtle' : undefined}
              _hover={{ bg: current ? 'bg.actionSubtle' : 'bg.subtle' }}
            >
              <Text
                as="span"
                textStyle="numeric.body"
                w="6"
                flexShrink="0"
                color={current ? 'text.action' : 'text.secondary'}
              >
                {index + 1}
              </Text>
              {section.title}
            </chakra.a>
          </li>
        );
      })}
    </Flex>
  );
}

// Figma TOC item 18:20 in the sidebar of tablet and desktop documents.
export function TableOfContents({
  sections,
}: {
  sections: readonly DocumentSection[];
}) {
  const [active, select] = useActiveSection(sections);
  const titleId = useId();
  return (
    <chakra.nav aria-labelledby={titleId}>
      <Text
        id={titleId}
        pl="3"
        pb="2"
        mb="1"
        textStyle="caption.strong"
        color="text.secondary"
      >
        Содержание
      </Text>
      <TocList sections={sections} active={active} onSelect={select} />
    </chakra.nav>
  );
}

const sectionCount = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${String(count)} разделов`;
  if (ones === 1) return `${String(count)} раздел`;
  if (ones >= 2 && ones <= 4) return `${String(count)} раздела`;
  return `${String(count)} разделов`;
};

// Figma TOC toggle 18:31: the collapsed table of contents on narrow screens.
// After a section is chosen the list closes and focus returns to the button.
export function TableOfContentsToggle({
  sections,
}: {
  sections: readonly DocumentSection[];
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  return (
    <chakra.nav aria-label="Содержание">
      <chakra.button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        display="flex"
        alignItems="center"
        gap="3"
        w="full"
        px="4"
        py="calc({spacing.3} - 1px)"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.strong"
        borderRadius="md"
        textAlign="start"
        cursor="pointer"
      >
        <Text as="span" flex="1" textStyle="label.default">
          Содержание
        </Text>
        <Text
          as="span"
          textStyle="caption.default"
          color="text.secondary"
          whiteSpace="nowrap"
        >
          {sectionCount(sections.length)}
        </Text>
        <Icon
          src={chevronDownIcon}
          size={24}
          transform={open ? 'rotate(180deg)' : undefined}
        />
      </chakra.button>
      <Box id={listId} hidden={!open} mt="2">
        <TocList
          sections={sections}
          active={undefined}
          onSelect={() => {
            setOpen(false);
            button.current?.focus({ preventScroll: true });
          }}
        />
      </Box>
    </chakra.nav>
  );
}
