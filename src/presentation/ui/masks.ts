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

// «1427» → «14:27». An hour digit that cannot start 00–23 gets a zero in front:
// «930» → «09:30», «25» → «02:5».
export function maskTime(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (/^[3-9]/.test(digits) || /^2[4-9]/.test(digits)) digits = `0${digits}`;
  digits = digits.slice(0, 4);
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
