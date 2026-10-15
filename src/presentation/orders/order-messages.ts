import type { OrderNotice, OrderPhase } from '@/application/order-flow';
import type {
  Order,
  OrderProposal,
  Position,
  Product,
} from '@/application/restaurant';
import { draftTotals, type Draft } from '@/domain/order-draft';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { listText, plural } from '@/presentation/ui/plural';
import { formatStamp } from '@/presentation/ui/zones';

export const positionsText = (count: number) =>
  `${String(count)} ${plural(count, 'позиция', 'позиции', 'позиций')}`;
export const portionsText = (count: number | bigint | string) =>
  `${String(count)} ${plural(count, 'порция', 'порции', 'порций')}`;
const ofPositions = (count: number) =>
  `${String(count)} ${plural(count, 'позиции', 'позиций', 'позиций')}`;
// «на 1 порцию», «на 3 порции», «на 5 порций».
const forPortions = (count: string) =>
  `${count} ${plural(count, 'порцию', 'порции', 'порций')}`;
const ofPortions = (count: bigint) =>
  `${String(count)} ${plural(count, 'порции', 'порций', 'порций')}`;
const sum = (positions: readonly Position[]) =>
  positions.reduce((total, position) => total + BigInt(position.portions), 0n);

export function compositionText(positions: readonly Position[]): string {
  return `${positionsText(positions.length)}, ${portionsText(sum(positions))}`;
}

export function draftSummary(draft: Draft): string {
  const totals = draftTotals(draft);
  return `${positionsText(totals.positions)} · ${portionsText(totals.portions)}`;
}

// «можно приготовить 3», «не хватает ни на одну — позиция исключена».
function available(portions: string): string {
  if (portions === '0') return 'не хватает ни на одну — позиция исключена';
  return `можно приготовить ${portions}`;
}

// «Позиция 2 · Борщ»; a dish whose name is not loaded yet is «блюдо».
const positionTitle = (
  lineNo: string,
  names: ReadonlyMap<string, string>,
  dishID: string,
) => `Позиция ${lineNo} · ${names.get(dishID) ?? 'блюдо'}`;

// «Проверено 14 октября, 10:00»: when the order was checked.
export function checkedText(epochMs: number, timeZone: string): string {
  return `Проверено ${formatStamp(epochMs, timeZone)}`;
}

export interface ChangeRow {
  readonly lineNo: string;
  readonly title: string;
  readonly text: string;
  readonly change: string;
  readonly excluded: boolean;
  readonly deficits: readonly string[];
}

const amount = (thousandths: string, product: Product | undefined) =>
  product === undefined
    ? formatThousandths(thousandths)
    : formatQuantity(thousandths, product.baseUnit);

// Figma 04: what the evaluation cut, with the deficits of each position.
export function changeRows(
  proposal: OrderProposal,
  names: ReadonlyMap<string, string>,
  products: ReadonlyMap<string, Product>,
): readonly ChangeRow[] {
  return proposal.changes.map((change) => ({
    lineNo: change.lineNo,
    title: positionTitle(change.lineNo, names, change.dishID),
    text: `${plural(change.requestedPortions, 'Заказана', 'Заказано', 'Заказано')} ${portionsText(change.requestedPortions)}, ${available(change.acceptedPortions)}`,
    change: `${change.requestedPortions} → ${change.acceptedPortions}`,
    excluded: change.acceptedPortions === '0',
    deficits: change.deficits.map((deficit) => {
      const product = products.get(deficit.productID);
      return `${product?.name ?? 'Продукт'}: на ${forPortions(change.requestedPortions)} нужно ${amount(deficit.requiredQuantity, product)}, для этой позиции осталось ${amount(deficit.availableQuantity, product)}`;
    }),
  }));
}

// Figma 06: positions whose accepted portions changed since the previous
// proposal.
export function previousRows(
  proposal: OrderProposal,
  previous: OrderProposal,
  names: ReadonlyMap<string, string>,
): readonly ChangeRow[] {
  const accepted = new Map(
    proposal.acceptedPositions.map((position) => [
      position.lineNo,
      position.portions,
    ]),
  );
  return previous.acceptedPositions
    .filter(
      (position) =>
        (accepted.get(position.lineNo) ?? '0') !== position.portions,
    )
    .map((position) => {
      const now = accepted.get(position.lineNo) ?? '0';
      return {
        lineNo: position.lineNo,
        title: positionTitle(position.lineNo, names, position.dishID),
        text: `В прошлом составе ${portionsText(position.portions)}, ${available(now)}`,
        change: `${position.portions} → ${now}`,
        excluded: now === '0',
        deficits: [],
      };
    });
}

export function acceptanceText(
  proposal: OrderProposal,
  again: boolean,
): string {
  const requested = proposal.requestedPositions;
  const accepted = proposal.acceptedPositions;
  const tail = again
    ? 'Подтвердите новый состав.'
    : 'Подтвердите, если вас устраивает такой заказ.';
  return `Осталось ${String(accepted.length)} из ${ofPositions(requested.length)}, ${String(sum(accepted))} из ${ofPortions(sum(requested))}. ${tail}`;
}

export function finalText(proposal: OrderProposal): string {
  const accepted = proposal.acceptedPositions;
  return `Итоговый состав · ${accepted.length === 0 ? positionsText(0) : compositionText(accepted)}`;
}

export interface PanelMessage {
  readonly tone: 'error' | 'unknown' | 'success' | 'info';
  readonly title: string;
  readonly text: string;
  // The time line under the title (F4).
  readonly stamp?: string;
}

export function attemptMessage(
  phase: Extract<OrderPhase, { kind: 'unknown' | 'pending' | 'conflict' }>,
  timeZone: string,
): PanelMessage & { readonly stamp: string; readonly footer: string } {
  const stamp = `Отправлено ${formatStamp(phase.attempt.startedAt, timeZone)}`;
  const footer = 'Новый заказ можно начать, когда станет ясно, прошёл ли этот.';
  switch (phase.kind) {
    case 'unknown':
      return {
        tone: 'unknown',
        title: 'Не знаем, оформлен ли заказ',
        text: phase.checking
          ? 'Проверяем результат. Второй раз заказ не оформится.'
          : 'Связь прервалась. Не оформляйте заказ заново — нажмите «Проверить результат», заказ не задвоится.',
        stamp,
        footer,
      };
    case 'pending':
      return {
        tone: 'unknown',
        title: 'Заказ ещё обрабатывается',
        text: 'Проверьте результат через минуту — заказ не задвоится.',
        stamp,
        footer,
      };
    case 'conflict':
      return {
        tone: 'error',
        title: 'Похоже, этот заказ уже отправляли',
        text: 'Повторная отправка не прошла, по ней ничего не списано. Проверьте результат или загляните в историю склада, прежде чем оформлять снова.',
        stamp,
        footer,
      };
  }
}

const notFound: PanelMessage = {
  tone: 'error',
  title: 'Проверьте заказ заново',
  text: 'Данные проверки устарели, заказ не оформлен. Блюда в заказе сохранены.',
};

export function outcomeMessage(
  phase: Extract<
    OrderPhase,
    { kind: 'not-found' | 'refused' | 'reset' | 'superseded' | 'empty' }
  >,
  timeZone: string,
): PanelMessage {
  switch (phase.kind) {
    case 'not-found':
      return phase.afterAttempt
        ? {
            tone: 'info',
            title: 'Данные заказа устарели',
            ...(phase.checkedAt === undefined
              ? {}
              : { stamp: checkedText(phase.checkedAt, timeZone) }),
            text: 'Мы не можем подтвердить, оформлен ли заказ. Прежде чем оформлять снова, загляните в историю склада — не списаны ли уже продукты.',
          }
        : notFound;
    case 'refused':
      return {
        tone: 'error',
        title: 'Заказ не оформлен',
        text:
          phase.code === 'InventoryUnavailable'
            ? 'Не получилось проверить остатки. Ничего не списано — попробуйте ещё раз.'
            : 'Заказ не прошёл. Ничего не списано — попробуйте ещё раз.',
      };
    case 'reset':
      return {
        tone: 'unknown',
        title: 'Не знаем, оформлен ли заказ',
        text: 'Была короткая техническая пауза, проверить заказ нельзя. Загляните в историю склада перед новым заказом.',
      };
    case 'superseded':
      return phase.replacement === undefined
        ? notFound
        : {
            tone: 'info',
            title: 'Состав заказа обновился',
            text: 'Мы пересчитали заказ, прежний вариант не оформлен. Подтвердите обновлённый заказ.',
          };
    case 'empty':
      return {
        tone: 'error',
        title: 'Ни одно блюдо из заказа сейчас нельзя приготовить',
        text: 'Остатков стало меньше после обновления меню. Измените состав и проверьте заказ заново.',
      };
  }
}

export function noticeMessage(notice: OrderNotice): PanelMessage {
  switch (notice.kind) {
    case 'portions':
      return {
        tone: 'error',
        title: 'Проверьте количество порций',
        text: `В ${notice.lines.length === 1 ? 'позиции' : 'позициях'} ${listText(notice.lines)} укажите целое число порций — 1 или больше.`,
      };
    case 'prepare-failed':
      return {
        tone: 'error',
        title: 'Не удалось проверить заказ',
        text: 'Блюда в заказе сохранены. Попробуйте ещё раз через пару минут.',
      };
    case 'check-failed':
      return {
        tone: 'error',
        title: 'Не удалось проверить результат',
        text: 'Попробуйте ещё раз через минуту.',
      };
  }
}

export function confirmedLines(
  order: Order,
  timeZone: string,
): { readonly stamp: string; readonly composition: string } {
  return {
    stamp: `Оформлен ${formatStamp(order.placedAt.epochMs, timeZone)}`,
    composition: `В заказе · ${compositionText(order.acceptedPositions)}`,
  };
}
