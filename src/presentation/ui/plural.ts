// Russian noun forms: 1 позиция, 2 позиции, 5 позиций, 21 позиция.
export function plural(
  count: number | bigint | string,
  one: string,
  few: string,
  many: string,
): string {
  const value = BigInt(count);
  const mod100 = value % 100n;
  const mod10 = value % 10n;
  if (mod100 >= 11n && mod100 <= 14n) return many;
  if (mod10 === 1n) return one;
  if (mod10 >= 2n && mod10 <= 4n) return few;
  return many;
}

// «5», «5 и 6», «2, 3 и 5».
export function listText(numbers: readonly number[]): string {
  const items = numbers.map(String);
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} и ${items.at(-1) ?? ''}`;
}
