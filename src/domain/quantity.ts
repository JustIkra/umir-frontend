// Quantities travel as decimal strings of thousandths of the product's base
// unit: "40000" is 40 g, "500" is 0.5 g. Arithmetic stays in BigInt.
export type BaseUnit = 'g' | 'ml' | 'pcs';

export const baseUnits: readonly BaseUnit[] = ['g', 'ml', 'pcs'];

const shortUnits: Readonly<Record<BaseUnit, string>> = {
  g: 'г',
  ml: 'мл',
  pcs: 'шт',
};

// Figma K05 radio «Единица учёта».
export const unitTitles: Readonly<Record<BaseUnit, string>> = {
  g: 'граммы, г',
  ml: 'миллилитры, мл',
  pcs: 'штуки, шт',
};

export function unitShort(unit: BaseUnit): string {
  return shortUnits[unit];
}

const groupThousands = (digits: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function formatThousandths(thousandths: string): string {
  const padded = thousandths.padStart(4, '0');
  const whole = padded.slice(0, -3).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-3).replace(/0+$/, '');
  return fraction === ''
    ? groupThousands(whole)
    : `${groupThousands(whole)},${fraction}`;
}

export function formatQuantity(thousandths: string, unit: BaseUnit): string {
  return `${formatThousandths(thousandths)} ${shortUnits[unit]}`;
}

export type QuantityError = 'required' | 'format' | 'precision' | 'zero';

export type ParsedQuantity =
  | { readonly ok: true; readonly thousandths: string }
  | { readonly ok: false; readonly error: QuantityError };

const quantityPattern = /^(\d+)(?:[.,](\d+))?$/;

// Operator input: «40», «0,5», «0.125», «1 250». At most three decimals
// (K17: «Не больше трёх знаков после запятой»).
export function parseQuantity(text: string): ParsedQuantity {
  const value = text.replace(/\s/g, '');
  if (value === '') return { ok: false, error: 'required' };
  const match = quantityPattern.exec(value);
  if (match === null) return { ok: false, error: 'format' };
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > 3) return { ok: false, error: 'precision' };
  const thousandths = (
    BigInt(whole) * 1000n +
    BigInt(fraction.padEnd(3, '0'))
  ).toString();
  if (thousandths === '0') return { ok: false, error: 'zero' };
  return { ok: true, thousandths };
}
