import { Combobox, Portal, Text, createListCollection } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import { Icon } from './icon';
import { matchesQuery } from './search';

export interface SearchOption {
  readonly value: string;
  readonly label: string;
  readonly code?: string;
}

// A list with search by name or code (spec 3.3): typing only filters, the
// value is always one of the options. With a name the value also goes into a
// hidden input for forms read through FormData.
export function SearchSelect({
  id,
  name,
  options,
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  invalid = false,
  disabled = false,
  'aria-describedby': describedBy,
  'aria-label': ariaLabel,
}: {
  id: string;
  name?: string;
  options: readonly SearchOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const selected = options.find((option) => option.value === current);
  const [input, setInput] = useState<string | undefined>(undefined);
  // The text shows the chosen name until the person types; typing filters.
  const shown = input ?? selected?.label ?? '';
  const query = input === undefined || input === selected?.label ? '' : input;
  const collection = useMemo(
    () =>
      createListCollection({
        items: options.filter((option) =>
          matchesQuery(query, option.label, option.code ?? ''),
        ),
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [options, query],
  );
  return (
    <Combobox.Root
      collection={collection}
      value={selected === undefined ? [] : [current]}
      inputValue={shown}
      onInputValueChange={(details) => {
        setInput(details.inputValue);
      }}
      onValueChange={(details) => {
        const next = details.value[0] ?? '';
        if (value === undefined) setOwn(next);
        setInput(undefined);
        onValueChange?.(next);
      }}
      onOpenChange={(details) => {
        if (!details.open) setInput(undefined);
      }}
      openOnClick
      disabled={disabled}
      invalid={invalid}
      ids={{ input: id }}
      positioning={{ sameWidth: true, gutter: 4 }}
    >
      <Combobox.Control>
        <Combobox.Input
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
        />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger aria-label="Показать список">
            <Icon src={chevronIcon} size={24} />
          </Combobox.Trigger>
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      {name !== undefined && (
        <input
          type="hidden"
          name={name}
          value={selected === undefined ? '' : current}
        />
      )}
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.Empty>Ничего не нашли</Combobox.Empty>
            {collection.items.map((item) => (
              <Combobox.Item key={item.value} item={item}>
                <Combobox.ItemText>{item.label}</Combobox.ItemText>
                {item.code !== undefined && (
                  <Text
                    as="span"
                    textStyle="numeric.default"
                    color="text.secondary"
                  >
                    {item.code}
                  </Text>
                )}
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
