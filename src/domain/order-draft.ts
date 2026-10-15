// The order the waiter assembles before «Проверить заказ». Each added dish
// is its own position, a repeated dish too (Figma 02); positions are numbered
// in order and renumbered on removal.
export interface DraftLine {
  readonly lineNo: number;
  readonly dishID: string;
  // As typed: the field keeps an invalid value (E11).
  readonly portions: string;
}

export type Draft = readonly DraftLine[];

function renumber(
  lines: readonly { readonly dishID: string; readonly portions: string }[],
): Draft {
  return lines.map((line, index) => ({
    lineNo: index + 1,
    dishID: line.dishID,
    portions: line.portions,
  }));
}

export function addDish(draft: Draft, dishID: string): Draft {
  return renumber([...draft, { dishID, portions: '1' }]);
}

export function setPortions(
  draft: Draft,
  lineNo: number,
  portions: string,
): Draft {
  return draft.map((line) =>
    line.lineNo === lineNo ? { ...line, portions } : line,
  );
}

export function removeLine(draft: Draft, lineNo: number): Draft {
  return renumber(draft.filter((line) => line.lineNo !== lineNo));
}

const portionsPattern = /^[1-9]\d{0,17}$/;

export function portionsValid(text: string): boolean {
  return portionsPattern.test(text.trim());
}

export function invalidLines(draft: Draft): readonly number[] {
  return draft
    .filter((line) => !portionsValid(line.portions))
    .map((line) => line.lineNo);
}

export function draftTotals(draft: Draft): {
  readonly positions: number;
  readonly portions: string;
} {
  let portions = 0n;
  for (const line of draft) {
    if (portionsValid(line.portions)) portions += BigInt(line.portions.trim());
  }
  return { positions: draft.length, portions: portions.toString() };
}

export function linesOf(draft: Draft, dishID: string): readonly number[] {
  return draft
    .filter((line) => line.dishID === dishID)
    .map((line) => line.lineNo);
}
