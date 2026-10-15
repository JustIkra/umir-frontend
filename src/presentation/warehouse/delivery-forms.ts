import type { DeliveryDraft } from '@/application/warehouse-commands';
import type { CivilTime } from '@/application/warehouse';
import { parseQuantity } from '@/domain/quantity';

const value = (data: FormData, name: string): string => {
  const v = data.get(name);
  return typeof v === 'string' ? v.trim() : '';
};
function civil(date: string, time: string): CivilTime | undefined {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  if (parts === null || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    return undefined;
  return {
    civil: {
      localDateTime: `${parts[3] ?? ''}-${parts[2] ?? ''}-${parts[1] ?? ''}T${time}:00`,
    },
  };
}
export function draftFromForm(
  data: FormData,
  rows: readonly { readonly key: number; readonly product: string }[],
  settingsVersion: string,
): DeliveryDraft | undefined {
  const number = value(data, 'number');
  const createdAt = civil(
    value(data, 'createdDate'),
    value(data, 'createdTime'),
  );
  if (number === '' || createdAt === undefined) return undefined;
  const lines: DeliveryDraft['lines'][number][] = [];
  for (const row of rows) {
    const key = String(row.key);
    const quantity = parseQuantity(value(data, `quantity-${key}`));
    const manufacturedAt = civil(
      value(data, `made-date-${key}`),
      value(data, `made-time-${key}`),
    );
    const receivedAt = civil(
      value(data, `received-date-${key}`),
      value(data, `received-time-${key}`),
    );
    const shelf = value(data, `shelf-${key}`);
    if (
      row.product === '' ||
      !quantity.ok ||
      manufacturedAt === undefined ||
      receivedAt === undefined ||
      !/^[1-9][0-9]{0,18}$/.test(shelf) ||
      BigInt(shelf) > 9223372036854775807n ||
      BigInt(quantity.thousandths) > 9223372036854775807n
    )
      return undefined;
    lines.push({
      productID: row.product,
      quantity: quantity.thousandths,
      manufacturedAt,
      receivedAt,
      shelfLife: { value: shelf, unit: 'day' },
    });
  }
  return { number, createdAt, expectedSettingsVersion: settingsVersion, lines };
}
export function civilFields(value: CivilTime | undefined): {
  date: string;
  time: string;
} {
  const [date = '', time = ''] = value?.civil.localDateTime.split('T') ?? [];
  const [year = '', month = '', day = ''] = date.split('-');
  return {
    date: date === '' ? '' : `${day}.${month}.${year}`,
    time: time.slice(0, 5),
  };
}
