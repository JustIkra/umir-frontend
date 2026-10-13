// Instants are shown in the organization's time zone (context.settings or
// access), never in a fixed «Москва, UTC+3».
export type InstantStyle = 'date' | 'time' | 'dateTime' | 'timeSeconds';

const styles: Readonly<Record<InstantStyle, Intl.DateTimeFormatOptions>> = {
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  dateTime: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  timeSeconds: {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  },
};

export function formatInstant(
  epochMs: number,
  timeZone: string,
  style: InstantStyle,
): string {
  return new Intl.DateTimeFormat('ru-RU', {
    ...styles[style],
    timeZone,
  }).format(epochMs);
}

// «UTC+3», «UTC+5:30», «UTC»: the zone's offset at that moment.
export function formatOffset(epochMs: number, timeZone: string): string {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(epochMs)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  // Some runtimes write the zero offset as «GMT+0».
  return name.replace('GMT', 'UTC').replace(/^UTC[+-]0$/, 'UTC');
}
