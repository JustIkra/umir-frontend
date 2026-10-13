import { SegmentBar, SegmentButton } from './segment';

// Figma Segment as a single choice (period, history filter): pressed buttons in
// a labelled group.
export function SegmentChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; title: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <SegmentBar role="group" aria-label={label} alignSelf="flex-start">
      {options.map((option) => (
        <SegmentButton
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.title}
        </SegmentButton>
      ))}
    </SegmentBar>
  );
}
