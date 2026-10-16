// Masks of typed fields. Values stay strings: quantities are exact thousandths
// and counts may exceed Number.MAX_SAFE_INTEGER.

// «1200,5», «12,345»: digits and one comma (a dot becomes one), at most three
// digits after it, no leading zeros before other digits.
export function sanitizeQuantity(raw: string): string {
  let whole = '';
  let fraction: string | undefined;
  for (const char of raw.replace(/\./g, ',')) {
    if (char === ',') {
      fraction ??= '';
    } else if (char >= '0' && char <= '9') {
      if (fraction === undefined) whole += char;
      else if (fraction.length < 3) fraction += char;
    }
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  if (fraction !== undefined && whole === '') whole = '0';
  return fraction === undefined ? whole : `${whole},${fraction}`;
}

// Whole days or portions: digits only, no leading zeros.
export function sanitizeCount(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

// A count from 1 with at most 18 digits, so it fits a signed int64.
export function countValid(text: string): boolean {
  return /^[1-9]\d{0,17}$/.test(text.trim());
}

// «1427» → «14:27». A lone hour digit before a typed colon is the hour, so it
// gets a zero in front («1:30» → «01:30», «1:» → «01:»). Without a colon, a
// compact time of at least three digits gets one too: «930» → «09:30».
// A colon typed right after two hour digits stays while no minute digit follows.
export function maskTime(raw: string): string {
  const colon = raw.indexOf(':');
  const onlyDigits = (text: string) => text.replace(/\D/g, '');
  const hourDigits = colon < 0 ? '' : onlyDigits(raw.slice(0, colon));
  const minuteDigits = colon < 0 ? '' : onlyDigits(raw.slice(colon + 1));
  const lone = hourDigits.length === 1 ? '0' : '';
  let digits =
    colon < 0 ? onlyDigits(raw) : `${lone}${hourDigits}${minuteDigits}`;
  if (
    colon < 0 &&
    digits.length >= 3 &&
    (/^[3-9]/.test(digits) || /^2[4-9]/.test(digits))
  )
    digits = `0${digits}`;
  digits = digits.slice(0, 4);
  if (digits.length === 2 && colon >= 0 && minuteDigits === '')
    return `${digits}:`;
  return digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
}

// On blur: «9» → «09:00», «14:2» → «14:02»; minutes over 59 are refused.
export function normalizeTime(raw: string): string | undefined {
  const masked = maskTime(raw);
  if (masked === '') return '';
  const [hours = '', minutes = ''] = masked.split(':');
  const h = hours.padStart(2, '0');
  const m = minutes.padStart(2, '0');
  if (Number(h) > 23 || Number(m) > 59) return undefined;
  return `${h}:${m}`;
}

const pad = (value: number) => String(value).padStart(2, '0');

// 00:00, 00:30 … 23:30.
export const timeOptions: readonly string[] = Array.from(
  { length: 48 },
  (_, index) =>
    `${pad(Math.floor(index / 2))}:${index % 2 === 0 ? '00' : '30'}`,
);

// The half hour at or before a time: «14:27» → «14:00».
export function nearestSlot(time: string): string {
  const exact = normalizeTime(time);
  if (exact === undefined || exact === '') return '';
  const [h = '00', m = '00'] = exact.split(':');
  return `${h}:${Number(m) < 30 ? '00' : '30'}`;
}

// «2026-10-15» ↔ «15.10.2026»; anything else gives ''.
export function isoDateToRu(iso: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return parts ? `${parts[3] ?? ''}.${parts[2] ?? ''}.${parts[1] ?? ''}` : '';
}
export function ruDateToIso(ru: string): string {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ru);
  return parts ? `${parts[3] ?? ''}-${parts[2] ?? ''}-${parts[1] ?? ''}` : '';
}

// «октябрь 2026 г.» from the calendar becomes the header «Октябрь 2026».
export function monthTitle(text: string): string {
  const plain = text.replace(/\s*г\.$/, '').trim();
  return `${plain.charAt(0).toUpperCase()}${plain.slice(1)}`;
}

// The half hours the list shows: all of them for a held value, and only those
// starting with what the person typed since the list opened (all again when
// nothing matches).
export function visibleTimes(text: string, typed: boolean): readonly string[] {
  if (!typed || text === '') return timeOptions;
  const matching = timeOptions.filter((option) => option.startsWith(text));
  return matching.length > 0 ? matching : timeOptions;
}

// The checked item of the list: the held value when it is one of the half hours.
export function selectedTime(text: string): readonly string[] {
  return timeOptions.includes(text) ? [text] : [];
}
