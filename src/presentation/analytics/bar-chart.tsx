import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { nextRow } from '@/domain/analytics';
import { rem } from '@/presentation/ui/units';

// Chart colours are semantic tokens: amber and red keep their meaning
// (expiry, loss); text never wears them.
export type ChartColor = 'bg.action' | 'bg.expiry' | 'border.error';

export interface BarSegment {
  readonly key: string;
  readonly color: ChartColor;
  // Share of the bar in percent, 0–100.
  readonly share: number;
}
export interface BarDetail {
  readonly value: string;
  readonly label: string;
}
export interface BarRow {
  readonly id: string;
  readonly name: string;
  readonly figure: string;
  readonly segments: readonly BarSegment[];
  readonly details: readonly BarDetail[];
}
export interface LegendItem {
  readonly key: string;
  readonly label: string;
  readonly color: ChartColor | 'line';
}

// Forced colours would drop the fills; the marks keep theirs.
const keepColors = {
  '@media (forced-colors: active)': { forcedColorAdjust: 'none' },
} as const;

export const detailText = (detail: BarDetail) =>
  `${detail.value} — ${detail.label}`;

// A stacked bar fills the width; a scale bar (scale) draws one part on a grey
// 0…max track with the threshold line.
function Bar({
  row,
  scale,
  threshold,
}: {
  row: BarRow;
  scale: boolean;
  threshold: number | undefined;
}) {
  const parts = row.segments.filter((segment) => segment.share > 0);
  const filled = scale ? parts.reduce((sum, part) => sum + part.share, 0) : 100;
  return (
    <Box
      gridArea="bar"
      position="relative"
      h={rem(12)}
      bg={scale ? 'bg.subtle' : undefined}
      borderEndRadius={scale ? 'sm' : undefined}
    >
      <Flex h="full" w={`${String(filled)}%`} gap="0.5">
        {parts.map((part, index) => (
          <Box
            key={part.key}
            data-segment={part.key}
            flexGrow={part.share}
            flexShrink={1}
            flexBasis="0"
            minW={rem(4)}
            bg={part.color}
            borderEndRadius={index === parts.length - 1 ? 'sm' : undefined}
            css={keepColors}
          />
        ))}
      </Flex>
      {threshold !== undefined && (
        <Box
          data-threshold=""
          position="absolute"
          top={rem(-4)}
          bottom={rem(-4)}
          left={`${String(threshold)}%`}
          w="1px"
          bg="border.strong"
          css={keepColors}
        />
      )}
    </Box>
  );
}

// Values lead, labels follow.
function Tooltip({ details }: { details: readonly BarDetail[] }) {
  return (
    <Stack
      aria-hidden="true"
      position="absolute"
      top="100%"
      insetStart="0"
      zIndex="content"
      mt="1"
      gap="0.5"
      px="3"
      py="2"
      w="max-content"
      maxW="full"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
      boxShadow="overlay"
      pointerEvents="none"
    >
      {details.map((detail) => (
        <Text
          key={detail.label}
          textStyle="caption.default"
          color="text.secondary"
        >
          <Text as="span" textStyle="caption.strong" color="text.primary">
            {detail.value}
          </Text>
          {` — ${detail.label}`}
        </Text>
      ))}
    </Stack>
  );
}

// One Tab stop per chart: arrows, Home and End move between the rows, the
// focused or hovered row shows its tooltip, Esc hides it.
export function BarChart({
  label,
  rows,
  scale = false,
  threshold,
}: {
  label: string;
  rows: readonly BarRow[];
  scale?: boolean;
  threshold?: number | undefined;
}) {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState<number | undefined>(undefined);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const current = Math.min(active, rows.length - 1);
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (event.key === 'Escape') {
      setShown(undefined);
      return;
    }
    const next = nextRow(index, event.key, rows.length);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    setShown(next);
    items.current[next]?.focus();
  };
  return (
    <chakra.ul
      role="list"
      aria-label={label}
      listStyleType="none"
      display="flex"
      flexDirection="column"
      gap="2"
    >
      {rows.map((row, index) => (
        <chakra.li
          key={row.id}
          ref={(node: HTMLLIElement | null) => {
            items.current[index] = node;
          }}
          tabIndex={index === current ? 0 : -1}
          aria-label={`${row.name}: ${row.details.map(detailText).join(', ')}`}
          position="relative"
          display="grid"
          gridTemplateColumns={{
            base: 'minmax(0, 1fr) auto',
            xl: `${rem(224)} minmax(0, 1fr) ${rem(232)}`,
          }}
          gridTemplateAreas={{
            base: '"name figure" "bar bar"',
            xl: '"name bar figure"',
          }}
          alignItems="center"
          columnGap="4"
          rowGap="1"
          px="1"
          py="1.5"
          borderRadius="sm"
          _hover={{ bg: 'bg.canvas' }}
          onPointerEnter={() => {
            setShown(index);
          }}
          onPointerLeave={() => {
            setShown((open) => (open === index ? undefined : open));
          }}
          onFocus={() => {
            setActive(index);
            setShown(index);
          }}
          onBlur={() => {
            setShown(undefined);
          }}
          onKeyDown={(event) => {
            onKeyDown(event, index);
          }}
        >
          <Text gridArea="name" minW="0" overflowWrap="anywhere">
            {row.name}
          </Text>
          <Text
            gridArea="figure"
            textStyle="numeric.default"
            color="text.secondary"
            textAlign="end"
          >
            {row.figure}
          </Text>
          <Bar row={row} scale={scale} threshold={threshold} />
          {shown === index && row.details.length > 0 && (
            <Tooltip details={row.details} />
          )}
        </chakra.li>
      ))}
    </chakra.ul>
  );
}

export function ChartLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <Flex
      as="ul"
      listStyleType="none"
      wrap="wrap"
      columnGap="4"
      rowGap="1"
      textStyle="caption.default"
      color="text.secondary"
    >
      {items.map((item) => (
        <Flex as="li" key={item.key} align="center" gap="2">
          {item.color === 'line' ? (
            <Box
              aria-hidden="true"
              w="1px"
              h={rem(14)}
              bg="border.strong"
              css={keepColors}
            />
          ) : (
            <Box
              aria-hidden="true"
              boxSize={rem(12)}
              borderRadius="sm"
              bg={item.color}
              css={keepColors}
            />
          )}
          {item.label}
        </Flex>
      ))}
    </Flex>
  );
}
