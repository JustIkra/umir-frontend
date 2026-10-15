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

// Reports when the segments stop or start being a whole date. zag commits a
// clear only when every segment is empty, so one emptied segment would leave
// the old date as the value while the person sees «дд.10.2026».
function Completeness({
  onIncomplete,
  onComplete,
}: {
  onIncomplete: () => void;
  onComplete: (iso: string) => void;
}) {
  const api = useDateInputContext();
  const parts = api
    .getSegments()
    .filter((part) => ['day', 'month', 'year'].includes(part.type));
  const incomplete = parts.some((part) => part.isPlaceholder);
  const [day = 0, month = 0, year = 0] = ['day', 'month', 'year'].map(
    (type) => parts.find((part) => part.type === type)?.value ?? 0,
  );
  const iso = `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
  const was = useRef(incomplete);
  useEffect(() => {
    if (was.current === incomplete) return;
    was.current = incomplete;
    if (incomplete) onIncomplete();
    else if (year >= 1000) onComplete(iso);
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
  const held = useRef(current);
  useEffect(() => {
    held.current = current;
  }, [current]);
  // The date the segments hold. It follows the value, except while the person
  // has emptied a segment: the value is then «» but the other segments stay.
  const [prior, setPrior] = useState(current);
  const [shown, setShown] = useState(current);
  const [partial, setPartial] = useState(false);
  if (current !== prior) {
    setPrior(current);
    if (current !== '' || !partial) setShown(current);
    if (current !== '') setPartial(false);
  }
  const trigger = useRef<HTMLButtonElement>(null);
  const dates = current === '' ? [] : [parseDate(current)];
  const shownDates = shown === '' ? [] : [parseDate(shown)];
  const set = (next: string) => {
    if (next === held.current) return;
    held.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  return (
    <DatePicker.Root
      value={dates}
      onValueChange={(details) => {
        set(details.value[0]?.toString() ?? '');
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
            onIncomplete={() => {
              if (held.current === '') return;
              setPartial(true);
              set('');
            }}
            onComplete={(iso) => {
              setPartial(false);
              set(iso);
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
                      set(today);
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
