import { findRestaurant, type AccessState } from '@/application/access';
import type { Settings } from '@/application/api';
import type { DeliveryPhase } from '@/application/delivery-flow';
import type { Product } from '@/application/restaurant';
import type { DeliveryInput, TimeInput } from '@/application/warehouse';
import type { DeliveryDraft } from '@/domain/delivery-draft';
import {
  formatQuantity,
  formatThousandths,
  parseQuantity,
} from '@/domain/quantity';
import { quantityErrorText } from '@/presentation/catalog/catalog-forms';
import { plural } from '@/presentation/ui/plural';
import { formatInstant } from '@/presentation/ui/time';

// The draft keeps a date field and a time field as one text: 'YYYY-MM-DD'
// and 'HH:MM' joined by 'T' (the values of native date and time inputs).
// Either part may be empty while the operator fills the other one.
export function civilParts(value: string): {
  readonly date: string;
  readonly time: string;
} {
  const index = value.indexOf('T');
  return index < 0
    ? { date: value, time: '' }
    : { date: value.slice(0, index), time: value.slice(index + 1) };
}

// The value after the operator changed one of the two inputs.
export function withCivilPart(
  value: string,
  part: 'date' | 'time',
  text: string,
): string {
  const parts = civilParts(value);
  const date = part === 'date' ? text : parts.date;
  const time = part === 'time' ? text : parts.time;
  return date === '' && time === '' ? '' : `${date}T${time}`;
}

const civilPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// A full local minute as milliseconds of the same wall time in UTC, or
// undefined for an incomplete or impossible value («2026-02-30T10:00»).
function civilMs(value: string): number | undefined {
  const match = civilPattern.exec(value);
  if (match === null) return undefined;
  const ms = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString().slice(0, 16) === value ? ms : undefined;
}

function wallMs(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
}

// The current local minute of the organization, 'YYYY-MM-DDTHH:MM': the page
// passes it to the checks «не позже текущего времени».
export function civilNow(epochMs: number, timeZone: string): string {
  return new Date(wallMs(epochMs, timeZone)).toISOString().slice(0, 16);
}

export type CivilKind = 'regular' | 'repeated' | 'skipped';

// How the zone reads a local minute: once, twice (the clocks went back,
// DS01) or never (the clocks went forward, DS02).
export function civilKind(
  value: string,
  timeZone: string,
): CivilKind | undefined {
  const local = civilMs(value);
  if (local === undefined) return undefined;
  const day = 86_400_000;
  const offsets = new Set(
    [local - day, local + day].map((at) => wallMs(at, timeZone) - at),
  );
  let found = 0;
  for (const offset of offsets) {
    if (wallMs(local - offset, timeZone) === local) found += 1;
  }
  return found === 0 ? 'skipped' : found > 1 ? 'repeated' : 'regular';
}

// The time fields whose local minute the zone reads that way: 'createdAt',
// '<key>.manufacturedAt', '<key>.receivedAt'.
export function timeFieldsOf(
  draft: DeliveryDraft,
  timeZone: string,
  kind: 'repeated' | 'skipped',
): ReadonlySet<string> {
  const fields = new Set<string>();
  if (civilKind(draft.createdAt, timeZone) === kind) fields.add('createdAt');
  for (const line of draft.lines) {
    if (civilKind(line.manufacturedAt, timeZone) === kind)
      fields.add(`${String(line.key)}.manufacturedAt`);
    if (civilKind(line.receivedAt, timeZone) === kind)
      fields.add(`${String(line.key)}.receivedAt`);
  }
  return fields;
}

export type DeliveryField = 'number' | 'createdAt';
export type LineField =
  'productID' | 'quantity' | 'manufacturedAt' | 'shelfLife' | 'receivedAt';
export type LineErrors = Partial<Record<LineField, string>>;

export interface DeliveryErrors {
  readonly fields: Partial<Record<DeliveryField, string>>;
  // By line key; a line without errors is absent.
  readonly lines: ReadonlyMap<number, LineErrors>;
  // Fields with an error, for the summary.
  readonly count: number;
}

const shelfLifePattern = /^\d+$/;

// Spec 8.2. Times are local minutes of the organization and compare as text;
// nowLocal is civilNow() of the page.
export function deliveryErrors(
  draft: DeliveryDraft,
  products: ReadonlyMap<string, Product>,
  nowLocal: string,
): DeliveryErrors {
  const fields: Partial<Record<DeliveryField, string>> = {};
  if (draft.number.trim() === '') fields.number = 'Укажите номер поставки';
  if (civilMs(draft.createdAt) === undefined) {
    fields.createdAt = 'Укажите дату и время создания';
  } else if (draft.createdAt > nowLocal) {
    fields.createdAt = 'Время создания не может быть позже текущего';
  }
  let count = Object.keys(fields).length;
  const lines = new Map<number, LineErrors>();
  for (const line of draft.lines) {
    const errors: LineErrors = {};
    if (line.productID === '') errors.productID = 'Выберите продукт';
    const parsed = parseQuantity(line.quantity);
    if (!parsed.ok) {
      // The catalog's «на порцию» wording does not fit a delivery line.
      errors.quantity =
        parsed.error === 'required'
          ? 'Укажите количество'
          : quantityErrorText(
              parsed.error,
              products.get(line.productID)?.baseUnit,
            );
    }
    const received = civilMs(line.receivedAt) !== undefined;
    if (!received) {
      errors.receivedAt = 'Укажите дату и время поступления';
    } else if (line.receivedAt > nowLocal) {
      errors.receivedAt = 'Поступление не может быть позже текущего времени';
    }
    if (civilMs(line.manufacturedAt) === undefined) {
      errors.manufacturedAt = 'Укажите дату и время изготовления';
    } else if (received && line.manufacturedAt > line.receivedAt) {
      errors.manufacturedAt = 'Изготовление не может быть позже поступления';
    }
    const shelfLife = line.shelfLifeValue.trim();
    if (!shelfLifePattern.test(shelfLife) || BigInt(shelfLife) === 0n) {
      errors.shelfLife = 'Укажите срок годности — целое число больше 0';
    }
    const found = Object.keys(errors).length;
    if (found > 0) lines.set(line.key, errors);
    count += found;
  }
  return { fields, lines, count };
}

export function deliverySummary(count: number): {
  readonly title: string;
  readonly text: string;
} {
  return {
    title: `Поставка не принята: ошибки в ${String(count)} ${plural(count, 'поле', 'полях', 'полях')}`,
    text: 'Исправьте отмеченные поля — введённые значения сохранены.',
  };
}

// The command body of a checked draft: every time as a local minute of the
// organization's zone with zero seconds; the DS01 choice goes with every
// time (the warehouse ignores it where the minute is not repeated).
export function deliveryInput(
  draft: DeliveryDraft,
  settingsVersion: string,
  occurrence: 'earlier' | 'later' | undefined,
): Omit<DeliveryInput, 'deliveryID'> {
  const time = (local: string): TimeInput => ({
    civil:
      occurrence === undefined
        ? { localDateTime: `${local}:00` }
        : { localDateTime: `${local}:00`, occurrence },
  });
  return {
    number: draft.number.trim(),
    createdAt: time(draft.createdAt),
    expectedSettingsVersion: settingsVersion,
    lines: draft.lines.map((line) => {
      const quantity = parseQuantity(line.quantity);
      const shelfLife = line.shelfLifeValue.trim();
      return {
        productID: line.productID,
        manufacturedAt: time(line.manufacturedAt),
        shelfLife: {
          value: shelfLifePattern.test(shelfLife)
            ? BigInt(shelfLife).toString()
            : shelfLife,
          unit: line.shelfLifeUnit,
        },
        receivedAt: time(line.receivedAt),
        quantity: quantity.ok ? quantity.thousandths : line.quantity,
      };
    }),
  };
}

// The zone and the settings version the delivery is sent with: the settings
// of the restaurant's organization in access.
export function organizationSettings(
  access: AccessState,
  restaurantID: string,
): Settings | undefined {
  const restaurant = findRestaurant(access, restaurantID);
  if (access.status !== 'ready' || restaurant === undefined) return undefined;
  return access.organizations.find(
    (organization) => organization.orgID === restaurant.orgID,
  )?.settings;
}

export interface DeliveryMessage {
  readonly tone: 'error' | 'unknown';
  readonly title: string;
  readonly text: string;
}

const dataCodes = new Set(['InvalidArgument', 'InvalidRequest']);

// The message above the form (spec 8.3). Sending, P6 and the field messages
// DS01, DS02 have none.
export function deliveryMessage(
  phase: DeliveryPhase,
  zone: string,
): DeliveryMessage | undefined {
  switch (phase.kind) {
    case 'editing':
    case 'sending':
    case 'received':
    case 'ambiguous-time':
    case 'nonexistent-time':
      return undefined;
    case 'unknown':
      return {
        tone: 'unknown',
        title: 'Результат приёма неизвестен',
        text: 'Ответ склада не получен. Поставка могла быть принята. Проверьте результат: проверка повторит ту же отправку и не создаст второй приход.',
      };
    case 'refused':
      return {
        tone: 'error',
        title: 'Поставка не принята',
        text: dataCodes.has(phase.code)
          ? 'Склад отклонил данные: ничего не записано. Проверьте форму и отправьте снова.'
          : 'Склад сейчас не принял поставку: ничего не записано. Повторите отправку.',
      };
    case 'conflict':
      return {
        tone: 'error',
        title: 'Поставка уже принята',
        text: 'Эта поставка уже записана другой отправкой, второй приход не создан. Откройте остатки или историю.',
      };
    case 'settings-changed':
      return {
        tone: 'error',
        title: 'Часовой пояс организации изменился',
        text: `Пока вы заполняли форму, зона организации стала ${zone}. Проверьте даты и время — они будут отправлены в новой зоне.`,
      };
    case 'reset':
      return {
        tone: 'unknown',
        title: 'Данные обновились',
        text: 'Склад перезапустился. Проверьте остатки: если поставки там нет, отправьте её снова.',
      };
  }
}

// A check that could not repeat the attempt (subproject 3, plan ruling 9).
export const checkFailedMessage: DeliveryMessage = {
  tone: 'error',
  title: 'Проверка не удалась',
  text: 'Не удалось проверить. Повторите позже.',
};

export const repeatedTimeText =
  'Это время повторяется из‑за перевода часов. Выберите, какое из двух:';
export const skippedTimeText =
  'Такого времени нет: часы переводились вперёд. Укажите другое время.';
export const occurrenceOptions = [
  { value: 'earlier', label: 'Раньше — до перевода часов' },
  { value: 'later', label: 'Позже — после перевода часов' },
] as const;

export interface ReceiptRowView {
  readonly batchID: string;
  readonly title: string;
  readonly batch: string;
  // expiresAt ≤ evaluatedAt: the batch waits for a confirmed write-off.
  readonly expired: boolean;
}

export const expiredNote =
  'Срок истёк до поступления: партия на складе и ждёт подтверждения списания.';

const count = (value: number, one: string, few: string, many: string) =>
  `${String(value)} ${plural(value, one, few, many)}`;

// Figma P6: the batches the warehouse created, by line number.
export function receiptView(
  phase: Extract<DeliveryPhase, { readonly kind: 'received' }>,
  products: ReadonlyMap<string, Product>,
  timeZone: string,
): {
  readonly title: string;
  readonly text: string;
  readonly rows: readonly ReceiptRowView[];
} {
  const { receipt, input, evaluatedAt } = phase;
  const batches = [...receipt.batches].sort((a, b) => {
    const left = BigInt(a.lineNo);
    const right = BigInt(b.lineNo);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return {
    title: `Поставка № ${input.number} принята`,
    text: `${count(input.lines.length, 'строка', 'строки', 'строк')} — ${count(receipt.batches.length, 'партия', 'партии', 'партий')}. Срок «годна до» рассчитал склад.`,
    rows: batches.map((batch) => {
      const product = products.get(batch.productID);
      const quantity =
        product === undefined
          ? formatThousandths(batch.receivedQuantity)
          : formatQuantity(batch.receivedQuantity, product.baseUnit);
      const expires = batch.expiresAt.epochMs;
      return {
        batchID: batch.batchID,
        title: `Строка ${batch.lineNo} · ${product?.name ?? batch.productID} · ${quantity}`,
        batch: `Партия ${batch.batchID} · годна до ${formatInstant(expires, timeZone, 'date')}, ${formatInstant(expires, timeZone, 'time')}`,
        expired: expires <= evaluatedAt.epochMs,
      };
    }),
  };
}
