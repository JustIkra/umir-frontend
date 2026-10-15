import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useId, useRef, useState } from 'react';
import checkIcon from '@/presentation/assets/icons/check-secondary-24.svg';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import closeIcon from '@/presentation/assets/icons/close-24.svg';
import { useServices } from '@/presentation/services';
import { atLeast, scrim } from '@/presentation/theme/system';
import { FieldLabel, FieldMessage, SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { formatOffset } from '@/presentation/ui/time';
import { rem } from '@/presentation/ui/units';
import { matchesQuery } from '@/presentation/ui/search';
import { organizationZones, zoneCity } from '@/presentation/ui/zones';
import { zoneValue } from './format';

// TZ04: nothing in the list matches the search.
export const noZonesMessage =
  'Ничего не найдено. Введите город или идентификатор зоны, например Asia/Yekaterinburg.';

// TZ09 at the zone field.
export const zoneUnsupported = (timeZone: string) =>
  `Зона «${timeZone}» не поддерживается сервисом. Выберите зону из списка.`;

// TZ03: the zones whose city, identifier or offset (as of nowMs) holds the
// query, in the order of the list.
export function filterZones(query: string, nowMs: number): readonly string[] {
  return organizationZones.filter((zone) =>
    matchesQuery(query, zoneCity(zone), zone, formatOffset(nowMs, zone)),
  );
}

// Figma Timezone field and list (TZ01, TZ02). From 1024 the list opens in
// place under the hint (a non-modal dialog, Esc handled here); on 390 it is a
// modal bottom sheet. The field is controlled: value is an IANA identifier and
// onChange hears the chosen one; the offsets are those of the current moment.
// The search filters the list by city and identifier (TZ03, TZ04).
export function TimezoneField({
  id,
  hint,
  value,
  onChange,
  disabled = false,
  error,
}: {
  id: string;
  hint: string;
  value: string;
  onChange: (timeZone: string) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const { now } = useServices();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const zones = filterZones(query, now());
  const list = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const close = () => list.current?.close();
  const show = () => {
    const dialog = list.current;
    if (!dialog) return;
    if (window.matchMedia(atLeast.sm).matches) dialog.show();
    else dialog.showModal();
    setOpen(true);
  };
  return (
    <Stack gap="1">
      <FieldLabel htmlFor={id} id={labelId}>
        Часовой пояс организации
      </FieldLabel>
      <chakra.button
        ref={button}
        id={id}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else show();
        }}
        display="flex"
        alignItems="center"
        gap="2"
        px="3"
        py="2"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.strong"
        borderRadius="md"
        textAlign="start"
        cursor="pointer"
        _expanded={{ borderWidth: '2px', borderColor: 'border.focus' }}
        _disabled={{ cursor: 'not-allowed', color: 'text.disabled' }}
        {...(error
          ? { borderWidth: '2px', borderColor: 'border.error' }
          : undefined)}
      >
        <Text id={valueId} as="span" flex="1" minW="0" textStyle="body.default">
          {zoneValue(value, now())}
        </Text>
        <Icon src={chevronIcon} size={24} />
      </chakra.button>
      <FieldMessage id={`${id}-hint`} hint={hint} error={error} />
      <chakra.dialog
        ref={list}
        id={listId}
        aria-label="Часовой пояс"
        p="0"
        m="0"
        border="0"
        bg="transparent"
        maxW="100vw"
        onClose={() => {
          setOpen(false);
          setQuery('');
          button.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        css={{
          position: 'fixed',
          insetInline: '0',
          insetBlockEnd: '0',
          insetBlockStart: 'auto',
          width: '100%',
          '&::backdrop': { background: scrim },
          '&:not(:modal)': {
            position: 'static',
            width: '100%',
            marginTop: '0.75rem',
          },
        }}
      >
        <Stack
          gap="1"
          py="2"
          px={{ base: '4', sm: '2' }}
          bg="bg.surface"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="md"
          boxShadow="overlay"
        >
          <Flex display={{ base: 'flex', sm: 'none' }} align="center" gap="2">
            <Text flex="1" textStyle="heading.h3">
              Часовой пояс
            </Text>
            <chakra.button
              type="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxSize="10"
              borderRadius="md"
              cursor="pointer"
              aria-label="Закрыть"
              onClick={close}
            >
              <Icon src={closeIcon} size={24} />
            </chakra.button>
          </Flex>
          <SearchInput
            label="Найти город или зону"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
          {zones.length === 0 && (
            <Text role="status" px="3" py="2" textStyle="body.default">
              {noZonesMessage}
            </Text>
          )}
          <Stack
            as="ul"
            gap="1"
            maxH={{ base: `min(${rem(420)}, 55dvh)`, sm: rem(320) }}
            overflowY="auto"
            listStyleType="none"
            aria-label="Часовые пояса"
          >
            {zones.map((option) => {
              const selected = option === value;
              return (
                <li key={option}>
                  <chakra.button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(option);
                      close();
                    }}
                    display="flex"
                    alignItems="center"
                    gap="3"
                    w="full"
                    minH="10"
                    px="3"
                    py="2"
                    borderRadius="md"
                    textAlign="start"
                    cursor="pointer"
                    bg={selected ? 'bg.actionSubtle' : 'transparent'}
                    _hover={{ bg: selected ? 'bg.actionSubtle' : 'bg.subtle' }}
                  >
                    <Text
                      as="span"
                      flex="1"
                      minW="0"
                      textStyle={selected ? 'body.strong' : 'body.default'}
                    >
                      {zoneCity(option)}
                    </Text>
                    <Text
                      as="span"
                      textStyle="mono.default"
                      color="text.secondary"
                    >
                      {option}
                    </Text>
                    <Text
                      as="span"
                      textStyle="caption.default"
                      color="text.secondary"
                    >
                      {formatOffset(now(), option)}
                    </Text>
                    {selected && (
                      <Box flexShrink="0">
                        <Icon src={checkIcon} size={24} />
                      </Box>
                    )}
                  </chakra.button>
                </li>
              );
            })}
          </Stack>
        </Stack>
      </chakra.dialog>
    </Stack>
  );
}
