import {
  DateInput,
  DatePicker,
  Portal,
  chakra,
  parseDate,
  useDateInputContext,
  useDatePickerContext,
  useDatePickerStyles,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import calendarIcon from '@/presentation/assets/icons/calendar-24.svg';
import { Button } from './actions';
import { Icon } from './icon';
import { isoDateToRu, monthTitle } from './masks';

const weekday = (name: string) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1).replace('.', '')}`;

const two = (n: number) => String(n).padStart(2, '0');

function isRealDate(iso: string): boolean {
  const moment = new Date(`${iso}T00:00:00Z`);
  return (
    !Number.isNaN(moment.getTime()) && moment.toISOString().startsWith(iso)
  );
}

// Reports how the segments stand: whole, half filled or all empty. zag
// commits a clear only when every segment is empty, so one emptied segment
// would leave the old date as the value while the person sees «дд.10.2026».
type Standing = 'whole' | 'half' | 'empty';

function Completeness({
  onStanding,
}: {
  onStanding: (standing: Standing, iso: string) => void;
}) {
  const api = useDateInputContext();
  const parts = api
    .getSegments()
    .filter((part) => ['day', 'month', 'year'].includes(part.type));
  const [day = 0, month = 0, year = 0] = ['day', 'month', 'year'].map(
    (type) => parts.find((part) => part.type === type)?.value ?? 0,
  );
  const iso = `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
  // A year still being typed shows as 2, 20, 202: not a date yet.
  const standing: Standing = parts.every((part) => !part.isPlaceholder)
    ? year >= 1000
      ? 'whole'
      : 'half'
    : parts.every((part) => part.isPlaceholder)
      ? 'empty'
      : 'half';
  const was = useRef(standing);
  useEffect(() => {
    if (was.current === standing) return;
    was.current = standing;
    onStanding(standing, iso);
  });
  return null;
}

// The month the grid belongs to: «Октябрь 2026».
function MonthTitle() {
  const api = useDatePickerContext();
  const styles = useDatePickerStyles();
  return (
    <chakra.div css={styles.rangeText} {...api.getRangeTextProps()}>
      {monthTitle(api.visibleRangeText.start)}
    </chakra.div>
  );
}

// A date (spec 3.1): segments «дд.мм.гггг» that take digits only and a
// calendar behind the button. The two share one value; «Сегодня» is today in
// the restaurant's zone, passed in as `today` so the browser's zone never
// counts. With a name the value goes into a hidden input as «дд.мм.гггг».
export function DateField({
  id,
  labelId,
  name,
  value,
  defaultValue = '',
  onValueChange,
  today,
  timeZone,
  invalid = false,
  disabled = false,
  'aria-describedby': describedBy,
}: {
  id: string;
  labelId?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  today: string;
  timeZone: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  // The last value given out, for dropping a repeat.
  const held = useRef(current);
  useEffect(() => {
    held.current = current;
  }, [current]);
  // The date the segments hold. It follows the value, except while the person
  // has emptied a segment: the value is then «» but the other segments stay.
  const [prior, setPrior] = useState(current);
  const [reported, setReported] = useState(current);
  const [shown, setShown] = useState(current);
  // The segments are half filled (or half emptied): the value is «».
  const [partial, setPartial] = useState(false);
  const partialNow = useRef(false);
  useEffect(() => {
    partialNow.current = partial;
  }, [partial]);
  // The segments are mounted afresh to take the value, when it is set from
  // outside them while they are half filled: zag does not redraw a date it
  // already holds.
  const [epoch, setEpoch] = useState(0);
  if (current !== prior) {
    setPrior(current);
    setReported(current);
    if (current !== reported && partial) {
      setPartial(false);
      setEpoch(epoch + 1);
    }
    if (current !== '' || !partial || current !== reported) setShown(current);
    if (current !== '') setPartial(false);
  }
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = trigger.current?.form;
    if (!form) return;
    const onReset = () => {
      if (!partialNow.current) return;
      setPartial(false);
      setShown(held.current);
      setEpoch((n) => n + 1);
    };
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('reset', onReset);
    };
  }, []);
  const dates = current === '' ? [] : [parseDate(current)];
  const shownDates = shown === '' ? [] : [parseDate(shown)];
  const set = (next: string) => {
    if (next === held.current) return;
    held.current = next;
    setReported(next);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  // The value is set from the calendar: half filled segments take it afresh.
  const setFromCalendar = (next: string) => {
    set(next);
    if (partial) {
      setPartial(false);
      setShown(next);
      setEpoch(epoch + 1);
    }
  };
  return (
    <DatePicker.Root
      value={dates}
      onValueChange={(details) => {
        setFromCalendar(details.value[0]?.toString() ?? '');
      }}
      locale="ru-RU"
      startOfWeek={1}
      timeZone={timeZone}
      disabled={disabled}
      positioning={{ placement: 'bottom-start', gutter: 4 }}
      w="full"
    >
      <DatePicker.Control data-invalid={invalid ? '' : undefined}>
        <DateInput.Root
          key={epoch}
          value={shownDates}
          onValueChange={(details) => {
            set(details.value[0]?.toString() ?? '');
          }}
          locale="ru-RU"
          granularity="day"
          timeZone={timeZone}
          disabled={disabled}
          invalid={invalid}
        >
          <Completeness
            onStanding={(standing, iso) => {
              setPartial(standing === 'half');
              // A day the month does not have (31.11) is left to zag, which
              // commits the nearest real day.
              if (standing === 'whole') {
                if (isRealDate(iso)) set(iso);
              } else if (held.current !== '') set('');
              if (standing === 'empty') setShown('');
            }}
          />
          <DateInput.Control>
            <DateInput.Segments
              id={id}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
            />
          </DateInput.Control>
        </DateInput.Root>
        <DatePicker.Trigger ref={trigger} aria-label="Открыть календарь">
          <Icon src={calendarIcon} size={24} />
        </DatePicker.Trigger>
      </DatePicker.Control>
      {name !== undefined && (
        <input type="hidden" name={name} value={isoDateToRu(current)} />
      )}
      <Portal>
        <DatePicker.Positioner>
          <DatePicker.Content>
            <DatePicker.Context>
              {(api) => (
                <>
                  <DatePicker.View view="day">
                    <DatePicker.ViewControl>
                      <DatePicker.PrevTrigger aria-label="Предыдущий месяц" />
                      <MonthTitle />
                      <DatePicker.NextTrigger aria-label="Следующий месяц" />
                    </DatePicker.ViewControl>
                    <DatePicker.Table>
                      <DatePicker.TableHead>
                        <DatePicker.TableRow>
                          {api.weekDays.map((day) => (
                            <DatePicker.TableHeader
                              key={day.long}
                              title={day.long}
                            >
                              {weekday(day.short)}
                            </DatePicker.TableHeader>
                          ))}
                        </DatePicker.TableRow>
                      </DatePicker.TableHead>
                      <DatePicker.TableBody>
                        {api.weeks.map((week, index) => (
                          <DatePicker.TableRow key={index}>
                            {week.map((day) => (
                              <DatePicker.TableCell
                                key={day.toString()}
                                value={day}
                              >
                                <DatePicker.TableCellTrigger>
                                  {day.day}
                                </DatePicker.TableCellTrigger>
                              </DatePicker.TableCell>
                            ))}
                          </DatePicker.TableRow>
                        ))}
                      </DatePicker.TableBody>
                    </DatePicker.Table>
                  </DatePicker.View>
                  <Button
                    variant="secondary"
                    alignSelf="flex-start"
                    onClick={() => {
                      setFromCalendar(today);
                      api.setOpen(false);
                      trigger.current?.focus();
                    }}
                  >
                    Сегодня
                  </Button>
                </>
              )}
            </DatePicker.Context>
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  );
}
