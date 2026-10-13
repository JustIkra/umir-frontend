import { Box, Flex } from '@chakra-ui/react';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { SegmentBar, SegmentButton } from './segment';

// WAI-ARIA tabs inside one page (Figma Segment 37:150): arrows, Home and End
// move between tabs; only the selected tab is in the Tab order.
export function Tabs({
  label,
  tabs,
  extra,
}: {
  label: string;
  tabs: readonly { id: string; title: string; content: ReactNode }[];
  extra?: ReactNode;
}) {
  const base = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const last = tabs.length - 1;
  const keys: Record<string, (index: number) => number> = {
    ArrowRight: (index) => (index === last ? 0 : index + 1),
    ArrowLeft: (index) => (index === 0 ? last : index - 1),
    Home: () => 0,
    End: () => last,
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move(index);
    setSelected(next);
    buttons.current[next]?.focus();
  };
  return (
    <>
      <Flex wrap="wrap" align="center" columnGap="3" rowGap="3">
        <SegmentBar role="tablist" aria-label={label}>
          {tabs.map((tab, index) => (
            <SegmentButton
              key={tab.id}
              ref={(element: HTMLButtonElement | null) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-${tab.id}-tab`}
              aria-selected={index === selected}
              aria-controls={`${base}-${tab.id}-panel`}
              tabIndex={index === selected ? 0 : -1}
              onClick={() => {
                setSelected(index);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
            >
              {tab.title}
            </SegmentButton>
          ))}
        </SegmentBar>
        {extra}
      </Flex>
      {tabs.map((tab, index) => (
        <Box
          key={tab.id}
          role="tabpanel"
          id={`${base}-${tab.id}-panel`}
          aria-labelledby={`${base}-${tab.id}-tab`}
          hidden={index !== selected}
        >
          {tab.content}
        </Box>
      ))}
    </>
  );
}
