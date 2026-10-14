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
import { formatInstant } from '@/presentation/ui/time';
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

// «доступна 1», «доступно 3», «доступно 0 — позиция исключена».
function available(portions: string): string {
  if (portions === '0') return 'доступно 0 — позиция исключена';
  return `${plural(portions, 'доступна', 'доступно', 'доступно')} ${portions}`;
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
    title: `Поз. ${change.lineNo} · ${names.get(change.dishID) ?? change.dishID}`,
    text: `${plural(change.requestedPortions, 'Запрошена', 'Запрошено', 'Запрошено')} ${portionsText(change.requestedPortions)}, ${available(change.acceptedPortions)}`,
    change: `${change.requestedPortions} → ${change.acceptedPortions}`,
    excluded: change.acceptedPortions === '0',
    deficits: change.deficits.map((deficit) => {
      const product = products.get(deficit.productID);
      return `${product?.name ?? deficit.productID}: на ${forPortions(change.requestedPortions)} нужно ${amount(deficit.requiredQuantity, product)}, доступно для позиции ${amount(deficit.availableQuantity, product)}`;
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
        title: `Поз. ${position.lineNo} · ${names.get(position.dishID) ?? position.dishID}`,
        text: `В прошлом предложении ${portionsText(position.portions)}, ${available(now)}`,
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
    ? 'Нужно новое подтверждение.'
    : 'Сокращение не принимается автоматически.';
  return `Принято ${String(accepted.length)} из ${ofPositions(requested.length)}, ${String(sum(accepted))} из ${ofPortions(sum(requested))}. ${tail}`;
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
  const stamp = `Попытка от ${formatStamp(phase.attempt.startedAt, timeZone)}`;
  switch (phase.kind) {
    case 'unknown':
      return {
        tone: 'unknown',
        title: 'Результат оформления неизвестен',
        text: phase.checking
          ? 'Проверяем эту же попытку — вторая продажа не создаётся.'
          : 'Ответ сервиса заказов не получен. Продажа могла быть записана. Не оформляйте заказ повторно: проверка продолжит ту же попытку.',
        stamp,
        footer: 'Новый заказ — после результата этой попытки.',
      };
    case 'pending':
      return {
        tone: 'unknown',
        title: 'Оформление ожидает результата',
        text: 'Сервис ещё обрабатывает попытку. Проверьте позже — повтор не создаст вторую продажу.',
        stamp,
        footer: 'Новый заказ — после результата этой попытки.',
      };
    case 'conflict':
      return {
        tone: 'error',
        title: 'Запрос отклонён: номер попытки уже занят',
        text: 'Этот номер попытки сервис уже связал с другим предложением и отклонил запрос. По нему ничего не записано, прежняя попытка не изменена. Новый номер автоматически не создаётся: сначала выясните, чем закончилась попытка с этим номером.',
        stamp: `${stamp} · CommandConflict`,
        footer: 'Новый заказ — после того, как результат попытки установлен.',
      };
  }
}

const notFound: PanelMessage = {
  tone: 'error',
  title: 'Предложение больше не найдено',
  text: 'Сервис заказов не нашёл это предложение: после перезапуска временные предложения не сохраняются. Из этого окна других попыток по нему не было. Подготовьте заказ заново, позиции сохранены, склад пересчитает состав.',
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
            title: 'Предложение больше не действует',
            ...(phase.checkedAt === undefined
              ? {}
              : { stamp: `Проверено ${formatStamp(phase.checkedAt, timeZone)}` }),
            text: 'Сервис заказов ответил на ту же попытку: предложение больше не действует, а записана ли продажа, он не подтверждает. Прежде чем оформлять заново, проверьте по истории склада, не списаны ли продукты по этой попытке.',
          }
        : notFound;
    case 'refused':
      return {
        tone: 'error',
        title: 'Заказ не оформлен',
        text:
          phase.code === 'InventoryUnavailable'
            ? 'Сервис склада не подготовил актуальные остатки. Продажа не записана, продукты не списаны.'
            : 'Сервис заказов не принял оформление. Продажа не записана, продукты не списаны.',
      };
    case 'reset':
      return {
        tone: 'unknown',
        title: 'Результат оформления неизвестен',
        text: 'Сервис заказов перезапустился, проверить эту попытку нельзя. Перед новым заказом убедитесь, что продажа не записана.',
      };
    case 'superseded':
      return phase.replacement === undefined
        ? notFound
        : {
            tone: 'info',
            title: 'Это предложение уже заменено',
            text: `Состав предложения пересчитан, сохранено новое предложение от ${formatInstant(phase.replacement.evaluatedAt.epochMs, timeZone, 'timeSeconds')}. Прежнее предложение оформить нельзя, продажа по нему не записана.`,
          };
    case 'empty':
      return {
        tone: 'error',
        title: 'Ни одно блюдо из заказа сейчас нельзя приготовить',
        text: 'Остатки изменились после оценки меню. Измените состав и подготовьте заказ заново.',
      };
  }
}

export function noticeMessage(notice: OrderNotice): PanelMessage {
  switch (notice.kind) {
    case 'portions':
      return {
        tone: 'error',
        title: 'Введите целое число порций больше 0',
        text: `Исправьте количество в поз. ${listText(notice.lines)}: допустимо только целое число порций больше 0. Введённое значение сохранено.`,
      };
    case 'prepare-failed':
      return {
        tone: 'error',
        title: 'Не удалось проверить заказ',
        text: 'Сервис заказов не ответил. Состав сохранён, повторите проверку.',
      };
    case 'check-failed':
      return {
        tone: 'error',
        title: 'Проверка не удалась',
        text: 'Не удалось проверить. Повторите позже.',
      };
  }
}

export function confirmedLines(
  order: Order,
  timeZone: string,
): { readonly stamp: string; readonly composition: string } {
  return {
    stamp: `Записан сервисом ${formatStamp(order.placedAt.epochMs, timeZone)}`,
    composition: `Оформленный состав · ${compositionText(order.acceptedPositions)}`,
  };
}
