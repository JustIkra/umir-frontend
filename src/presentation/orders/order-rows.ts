import type {
  Deficit,
  Menu,
  Product,
  Recommendations,
  StopList,
} from '@/application/restaurant';
import { linesOf, type Draft } from '@/domain/order-draft';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { listText } from '@/presentation/ui/plural';
import { matchesQuery } from '@/presentation/ui/search';
import { formatInstant } from '@/presentation/ui/time';
import { formatStamp } from '@/presentation/ui/zones';

// Figma 02: «В заказе: поз. 3 и 5» next to the menu dish.
export function inDraftText(draft: Draft, dishID: string): string | undefined {
  const lines = linesOf(draft, dishID);
  return lines.length === 0 ? undefined : `В заказе: поз. ${listText(lines)}`;
}

export interface MenuRow {
  readonly dishID: string;
  readonly name: string;
  readonly inDraft: string | undefined;
}

export function menuRows(
  menu: Menu,
  draft: Draft,
  query: string,
): readonly MenuRow[] {
  return menu.dishes
    .filter((dish) => matchesQuery(query, dish.name))
    .map((dish) => ({
      dishID: dish.dishID,
      name: dish.name,
      inDraft: inDraftText(draft, dish.dishID),
    }));
}

// A product name inside a sentence: «сливки 33%», but «FEFO-набор».
export function inSentence(name: string): string {
  const second = name.charAt(1);
  if (
    second !== '' &&
    second === second.toUpperCase() &&
    second !== second.toLowerCase()
  ) {
    return name;
  }
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

export function productMap(
  products: readonly Product[],
): ReadonlyMap<string, Product> {
  return new Map(products.map((product) => [product.productID, product]));
}

const amount = (thousandths: string, product: Product | undefined) =>
  product === undefined
    ? formatThousandths(thousandths)
    : formatQuantity(thousandths, product.baseUnit);

// E03: «сливки 33% — нужно 50 мл, есть 20 мл».
export function deficitText(
  deficit: Deficit,
  products: ReadonlyMap<string, Product>,
): string {
  const product = products.get(deficit.productID);
  const name =
    product === undefined ? deficit.productID : inSentence(product.name);
  return `${name} — нужно ${amount(deficit.requiredQuantity, product)}, есть ${amount(deficit.availableQuantity, product)}`;
}

export interface StopRow {
  readonly dishID: string;
  readonly name: string;
  readonly reasons: readonly string[];
}

export function stopRows(
  stopList: StopList,
  products: ReadonlyMap<string, Product>,
  query: string,
): readonly StopRow[] {
  return stopList.dishes
    .filter((dish) => matchesQuery(query, dish.name))
    .map((dish) => ({
      dishID: dish.dishID,
      name: dish.name,
      reasons: dish.deficits.map(
        (deficit) => `На порцию не хватает: ${deficitText(deficit, products)}`,
      ),
    }));
}

export interface ReasonRow {
  readonly title: string;
  readonly perPortion: string;
  readonly expires: string;
}

export interface RecommendationRow {
  readonly rank: number;
  readonly dishID: string;
  readonly name: string;
  readonly nearest: string;
  readonly reasons: readonly ReasonRow[];
}

const dateTime = (epochMs: number, timeZone: string) =>
  `${formatInstant(epochMs, timeZone, 'date')}, ${formatInstant(epochMs, timeZone, 'time')}`;

// E05: the order of the service, the nearest expiry and every reason.
export function recommendationRows(
  recommendations: Recommendations,
  timeZone: string,
): readonly RecommendationRow[] {
  return recommendations.items.map((item, index) => ({
    rank: index + 1,
    dishID: item.dishID,
    name: item.dishName,
    nearest: `Ближайший срок партий одной порции — ${dateTime(item.priorityExpiresAt.epochMs, timeZone)}. ${item.reasons.length === 1 ? 'Причина:' : 'Причины:'}`,
    reasons: item.reasons.map((reason) => ({
      title: `${reason.productName} · партия ${reason.batchID}`,
      perPortion: `${formatQuantity(reason.quantityPerPortion, reason.baseUnit)} на порцию`,
      expires: `Срок до ${dateTime(reason.expiresAt.epochMs, timeZone)}`,
    })),
  }));
}

export function evaluationText(epochMs: number, timeZone: string): string {
  return `Оценка ${formatStamp(epochMs, timeZone)}`;
}
