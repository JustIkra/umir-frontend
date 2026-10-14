// The delivery the storekeeper fills in before «Принять поставку» (P1). Every
// field keeps the text as typed: the form checks it (spec 8.2) and nothing is
// fixed on submit. A line's number on screen is its position; the key is a
// stable React key that is never reused within the draft.
export type ShelfLifeUnit = 'day' | 'month';

export interface DeliveryLineDraft {
  readonly key: number;
  // '' until chosen.
  readonly productID: string;
  readonly quantity: string;
  // 'YYYY-MM-DDTHH:MM' local civil time of the organization zone; '' until set.
  readonly manufacturedAt: string;
  readonly shelfLifeValue: string;
  readonly shelfLifeUnit: ShelfLifeUnit;
  readonly receivedAt: string;
}

export interface DeliveryDraft {
  readonly number: string;
  // 'YYYY-MM-DDTHH:MM', '' until set.
  readonly createdAt: string;
  readonly lines: readonly DeliveryLineDraft[];
  readonly nextKey: number;
}

type LineField =
  | 'productID'
  | 'quantity'
  | 'manufacturedAt'
  | 'shelfLifeValue'
  | 'shelfLifeUnit'
  | 'receivedAt';

function emptyLine(key: number): DeliveryLineDraft {
  return {
    key,
    productID: '',
    quantity: '',
    manufacturedAt: '',
    shelfLifeValue: '',
    shelfLifeUnit: 'day',
    receivedAt: '',
  };
}

const isShelfLifeUnit = (value: string): value is ShelfLifeUnit =>
  value === 'day' || value === 'month';

export function emptyDeliveryDraft(): DeliveryDraft {
  return { number: '', createdAt: '', lines: [emptyLine(1)], nextKey: 2 };
}

export function addDeliveryLine(draft: DeliveryDraft): DeliveryDraft {
  return {
    ...draft,
    lines: [...draft.lines, emptyLine(draft.nextKey)],
    nextKey: draft.nextKey + 1,
  };
}

// P1: the only line cannot be removed.
export function removeDeliveryLine(
  draft: DeliveryDraft,
  key: number,
): DeliveryDraft {
  if (
    draft.lines.length <= 1 ||
    !draft.lines.some((line) => line.key === key)
  ) {
    return draft;
  }
  return { ...draft, lines: draft.lines.filter((line) => line.key !== key) };
}

export function setDeliveryField(
  draft: DeliveryDraft,
  field: 'number' | 'createdAt',
  value: string,
): DeliveryDraft {
  return field === 'number'
    ? { ...draft, number: value }
    : { ...draft, createdAt: value };
}

function withField(
  line: DeliveryLineDraft,
  field: LineField,
  value: string,
): DeliveryLineDraft {
  switch (field) {
    case 'productID':
      return { ...line, productID: value };
    case 'quantity':
      return { ...line, quantity: value };
    case 'manufacturedAt':
      return { ...line, manufacturedAt: value };
    case 'shelfLifeValue':
      return { ...line, shelfLifeValue: value };
    case 'shelfLifeUnit':
      return isShelfLifeUnit(value) ? { ...line, shelfLifeUnit: value } : line;
    case 'receivedAt':
      return { ...line, receivedAt: value };
  }
}

// An unknown key or a unit other than day and month returns the same draft.
export function setLineField(
  draft: DeliveryDraft,
  key: number,
  field: LineField,
  value: string,
): DeliveryDraft {
  const line = draft.lines.find((entry) => entry.key === key);
  if (line === undefined) return draft;
  const next = withField(line, field, value);
  if (next === line) return draft;
  return {
    ...draft,
    lines: draft.lines.map((entry) => (entry === line ? next : entry)),
  };
}

// Nothing typed in any field. The unit choice and extra empty lines are not
// input: a draft with only those is still empty.
export function isDeliveryDraftEmpty(draft: DeliveryDraft): boolean {
  return (
    draft.number === '' &&
    draft.createdAt === '' &&
    draft.lines.every(
      (line) =>
        line.productID === '' &&
        line.quantity === '' &&
        line.manufacturedAt === '' &&
        line.shelfLifeValue === '' &&
        line.receivedAt === '',
    )
  );
}
