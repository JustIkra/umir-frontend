import { formatInstant, formatOffset } from './time';

// Russian names of the zones an organization can choose (Figma TZ02).
const zoneCities: Readonly<Record<string, string>> = {
  'Europe/Moscow': 'Москва',
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Samara': 'Самара',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан',
  'Asia/Kamchatka': 'Камчатка',
  'Europe/Berlin': 'Берлин',
  'Europe/Minsk': 'Минск',
  'Asia/Tashkent': 'Ташкент',
};

// The zones of the list in the order of Figma TZ02: Russia from Moscow
// eastwards, then foreign zones. The list is static: Auth sends none.
export const organizationZones: readonly string[] = Object.keys(zoneCities);

// «Москва»; a zone without a Russian name keeps its identifier.
export function zoneCity(timeZone: string): string {
  return zoneCities[timeZone] ?? timeZone;
}

export function zoneLabel(timeZone: string, epochMs: number): string {
  return `${zoneCity(timeZone)}, ${formatOffset(epochMs, timeZone)}`;
}

// The caption under a section title: «Среда, 14 октября 2026 · Москва, UTC+3».
export function formatSectionDate(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const weekday = part('weekday');
  const capitalized = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
  return `${capitalized}, ${part('day')} ${part('month')} ${part('year')} · ${zoneLabel(timeZone, epochMs)}`;
}

// «14.10.2026, 10:00:00 UTC+3»: when a read or a command was evaluated.
export function formatStamp(epochMs: number, timeZone: string): string {
  return `${formatInstant(epochMs, timeZone, 'date')}, ${formatInstant(epochMs, timeZone, 'timeSeconds')} ${formatOffset(epochMs, timeZone)}`;
}
