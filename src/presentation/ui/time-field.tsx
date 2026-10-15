import { Combobox, Portal, createListCollection } from '@chakra-ui/react';
import { useMemo, useRef, useState } from 'react';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import { Icon } from './icon';
import {
  maskTime,
  nearestSlot,
  normalizeTime,
  selectedTime,
  visibleTimes,
} from './masks';

// Time of the day (spec 3.2): digits only with the colon put in, a list of half
// hours that opens at the nearest one, an exact time can be typed. On blur
// «930» becomes «09:30»; a time out of range stays as typed and is invalid.
export function TimeField({
  id,
  name,
  value,
  defaultValue = '',
  onValueChange,
  now = '',
  invalid = false,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  now?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const set = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // True while the text comes from typing in this opening of the list: only
  // then the list is filtered. A held value shows every half hour.
  const [typed, setTyped] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => createListCollection({ items: [...visibleTimes(text, typed)] }),
    [text, typed],
  );
  const wrong = normalizeTime(text) === undefined;
  return (
    <Combobox.Root
      collection={items}
      value={[...selectedTime(text)]}
      inputValue={text}
      onInputValueChange={(details) => {
        const masked = maskTime(details.inputValue);
        // The input is uncontrolled in the DOM and is re-synced only when the
        // text changes; a refused character («a», a third minute digit) leaves
        // the text as it was, so the masked text is written back by hand.
        if (masked !== details.inputValue && input.current !== null)
          input.current.value = masked;
        setTyped(details.reason === 'input-change');
        set(masked);
      }}
      onValueChange={(details) => {
        set(details.value[0] ?? text);
      }}
      highlightedValue={highlighted}
      onHighlightChange={(details) => {
        setHighlighted(details.highlightedValue);
      }}
      onOpenChange={(details) => {
        if (details.reason === 'input-change') return;
        setTyped(false);
        if (details.open)
          setHighlighted(nearestSlot(text) || nearestSlot(now) || null);
      }}
      // The text is the source of truth: leaving a half hour by typing must not
      // clear the input when the checked item goes away.
      selectionBehavior="preserve"
      allowCustomValue
      openOnClick
      disabled={disabled}
      invalid={invalid || wrong}
      ids={{ input: id }}
      positioning={{ sameWidth: false, gutter: 4, placement: 'bottom-start' }}
    >
      <Combobox.Control>
        <Combobox.Input
          ref={input}
          inputMode="numeric"
          placeholder="чч:мм"
          maxLength={5}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          onBlur={() => {
            const exact = normalizeTime(text);
            if (exact !== undefined && exact !== text) set(exact);
          }}
        />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger aria-label="Показать время">
            <Icon src={chevronIcon} size={24} />
          </Combobox.Trigger>
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      {name !== undefined && (
        <input type="hidden" name={name} value={normalizeTime(text) ?? text} />
      )}
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content minW="7rem">
            {items.items.map((item) => (
              <Combobox.Item key={item} item={item}>
                <Combobox.ItemText textStyle="numeric.body">
                  {item}
                </Combobox.ItemText>
                <Combobox.ItemIndicator>
                  <Icon src={checkIcon} size={16} />
                </Combobox.ItemIndicator>
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
