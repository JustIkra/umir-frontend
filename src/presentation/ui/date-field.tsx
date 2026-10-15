import { DateInput, DatePicker, Portal, parseDate } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import calendarIcon from '@/presentation/assets/icons/calendar-24.svg';
import { Button } from './actions';
import { Icon } from './icon';
import { isoDateToRu } from './masks';

const weekday = (name: string) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1).replace('.', '')}`;

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
  const trigger = useRef<HTMLButtonElement>(null);
  const dates = current === '' ? [] : [parseDate(current)];
  const set = (next: string) => {
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
          value={dates}
          onValueChange={(details) => {
            set(details.value[0]?.toString() ?? '');
          }}
          locale="ru-RU"
          granularity="day"
          timeZone={timeZone}
          disabled={disabled}
          invalid={invalid}
        >
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
                      <DatePicker.RangeText />
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
