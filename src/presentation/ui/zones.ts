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

// «Москва (UTC+3)»: where the zone itself is the subject, such as the
// organization settings. The offset is the one at epochMs: it changes with
// summer time.
export function zoneLabel(timeZone: string, epochMs: number): string {
  return `${zoneCity(timeZone)} (${formatOffset(epochMs, timeZone)})`;
}

const dayMonth = (epochMs: number, timeZone: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).format(epochMs);

// The caption under a section title: «Среда, 14 октября · Москва». The zone is
// named once here, so the times on the page go without it.
export function formatSectionDate(epochMs: number, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'long',
  }).format(epochMs);
  const capitalized = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
  return `${capitalized}, ${dayMonth(epochMs, timeZone)} · ${zoneCity(timeZone)}`;
}

// «14 октября, 10:00»: when data was read or an action was sent.
export function formatStamp(epochMs: number, timeZone: string): string {
  return `${dayMonth(epochMs, timeZone)}, ${formatInstant(epochMs, timeZone, 'time')}`;
}

export function formatAbsoluteStamp(epochMs: number, timeZone: string): string {
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(epochMs);
  return `${date}, ${formatInstant(epochMs, timeZone, 'time')}`;
}
