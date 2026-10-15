import type {
  Allocation,
  Change,
  ConfirmResult,
  Deficit,
  Menu,
  MenuDish,
  Order,
  OrderProposal,
  Position,
  Recommendation,
  RecommendationReason,
  Recommendations,
  StopList,
  StopListDish,
} from '@/application/restaurant';
import { baseUnits } from '@/domain/quantity';
import {
  array,
  entityId,
  instant,
  nonEmptyString,
  nonNegativeInt64,
  object,
  oneOf,
  positiveInt64,
  string,
  closedObject,
  decimal6,
  exactNumber,
  instantNanos,
  DecodeError,
} from './common';
import { decodeCoverage, decodePlanningWindow } from './planning';

const id = nonEmptyString;

function decodeMenuDish(value: unknown, path: string): MenuDish {
  const dish = object(value, path);
  return {
    dishID: id(dish.dishID, `${path}.dishID`),
    name: string(dish.name, `${path}.name`),
  };
}

export function decodeMenu(value: unknown, path: string): Menu {
  const menu = object(value, path);
  return {
    evaluatedAt: instant(menu.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(menu.stateVersion, `${path}.stateVersion`),
    dishes: array(menu.dishes, `${path}.dishes`, decodeMenuDish),
  };
}

function decodeDeficit(value: unknown, path: string): Deficit {
  const deficit = object(value, path);
  return {
    productID: id(deficit.productID, `${path}.productID`),
    requiredQuantity: positiveInt64(
      deficit.requiredQuantity,
      `${path}.requiredQuantity`,
    ),
    availableQuantity: nonNegativeInt64(
      deficit.availableQuantity,
      `${path}.availableQuantity`,
    ),
  };
}

function decodeStopListDish(value: unknown, path: string): StopListDish {
  const dish = object(value, path);
  return {
    dishID: id(dish.dishID, `${path}.dishID`),
    name: string(dish.name, `${path}.name`),
    deficits: array(dish.deficits, `${path}.deficits`, decodeDeficit),
  };
}

export function decodeStopList(value: unknown, path: string): StopList {
  const list = object(value, path);
  return {
    evaluatedAt: instant(list.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(list.stateVersion, `${path}.stateVersion`),
    dishes: array(list.dishes, `${path}.dishes`, decodeStopListDish),
  };
}

function decodeReason(value: unknown, path: string): RecommendationReason {
  const reason = closedObject(value, path, [
    'productID',
    'productName',
    'batchID',
    'quantityPerPortion',
    'riskQuantity',
    'targetPortions',
    'remainingSeconds',
    'baseUnit',
    'expiresAt',
  ]);
  return {
    productID: id(reason.productID, `${path}.productID`),
    productName: string(reason.productName, `${path}.productName`),
    batchID: id(reason.batchID, `${path}.batchID`),
    quantityPerPortion: positiveInt64(
      reason.quantityPerPortion,
      `${path}.quantityPerPortion`,
    ),
    riskQuantity: positiveInt64(reason.riskQuantity, `${path}.riskQuantity`),
    targetPortions: positiveInt64(
      reason.targetPortions,
      `${path}.targetPortions`,
    ),
    remainingSeconds: nonNegativeInt64(
      reason.remainingSeconds,
      `${path}.remainingSeconds`,
    ),
    baseUnit: oneOf(reason.baseUnit, `${path}.baseUnit`, baseUnits),
    expiresAt: instant(reason.expiresAt, `${path}.expiresAt`),
  };
}

function decodeRecommendation(value: unknown, path: string): Recommendation {
  const item = closedObject(value, path, [
    'dishID',
    'dishName',
    'score',
    'demandBasis',
    'priorityExpiresAt',
    'reasons',
  ]);
  return {
    dishID: id(item.dishID, `${path}.dishID`),
    dishName: string(item.dishName, `${path}.dishName`),
    score: decimal6(item.score, `${path}.score`),
    demandBasis: oneOf(item.demandBasis, `${path}.demandBasis`, [
      'history',
      'fallback',
    ]),
    priorityExpiresAt: instant(
      item.priorityExpiresAt,
      `${path}.priorityExpiresAt`,
    ),
    reasons: array(item.reasons, `${path}.reasons`, decodeReason),
  };
}

export function decodeRecommendations(
  value: unknown,
  path: string,
): Recommendations {
  const recommendations = closedObject(value, path, [
    'evaluatedAt',
    'stateVersion',
    'policyVersion',
    'horizonHours',
    'window',
    'coverage',
    'items',
  ]);
  const result: Recommendations = {
    evaluatedAt: instant(recommendations.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      recommendations.stateVersion,
      `${path}.stateVersion`,
    ),
    items: array(recommendations.items, `${path}.items`, decodeRecommendation),
    policyVersion: oneOf(
      recommendations.policyVersion,
      `${path}.policyVersion`,
      ['FIN1'],
    ),
    horizonHours: exactNumber(
      recommendations.horizonHours,
      `${path}.horizonHours`,
      72,
    ),
    window: decodePlanningWindow(recommendations.window, `${path}.window`),
    coverage: decodeCoverage(recommendations.coverage, `${path}.coverage`),
  };
  if (
    result.items.length > 10 ||
    new Set(result.items.map((item) => item.dishID)).size !==
      result.items.length
  )
    throw new DecodeError(path, 'duplicate or oversized recommendation result');
  const at = instantNanos(result.evaluatedAt);
  for (const item of result.items) {
    if (
      item.reasons.length < 1 ||
      item.reasons.length > 500 ||
      new Set(item.reasons.map((reason) => reason.productID)).size !==
        item.reasons.length
    )
      throw new DecodeError(path, 'invalid recommendation reasons');
    let earliest: bigint | undefined;
    for (const reason of item.reasons) {
      const expiry = instantNanos(reason.expiresAt);
      if (
        expiry <= at ||
        expiry > at + 72n * 3600n * 1_000_000_000n ||
        BigInt(reason.remainingSeconds) !== (expiry - at) / 1_000_000_000n
      )
        throw new DecodeError(path, 'invalid recommendation expiry');
      if (earliest === undefined || expiry < earliest) earliest = expiry;
    }
    if (instantNanos(item.priorityExpiresAt) !== earliest)
      throw new DecodeError(path, 'priority expiry differs from reasons');
  }
  return result;
}

function decodePosition(value: unknown, path: string): Position {
  const position = object(value, path);
  return {
    lineNo: positiveInt64(position.lineNo, `${path}.lineNo`),
    dishID: id(position.dishID, `${path}.dishID`),
    portions: positiveInt64(position.portions, `${path}.portions`),
  };
}

function decodeChange(value: unknown, path: string): Change {
  const change = object(value, path);
  return {
    lineNo: positiveInt64(change.lineNo, `${path}.lineNo`),
    dishID: id(change.dishID, `${path}.dishID`),
    requestedPortions: positiveInt64(
      change.requestedPortions,
      `${path}.requestedPortions`,
    ),
    acceptedPortions: nonNegativeInt64(
      change.acceptedPortions,
      `${path}.acceptedPortions`,
    ),
    deficits: array(change.deficits, `${path}.deficits`, decodeDeficit),
  };
}

export function decodeOrderProposal(
  value: unknown,
  path: string,
): OrderProposal {
  const proposal = object(value, path);
  return {
    proposalID: id(proposal.proposalID, `${path}.proposalID`),
    evaluatedAt: instant(proposal.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      proposal.stateVersion,
      `${path}.stateVersion`,
    ),
    requestedPositions: array(
      proposal.requestedPositions,
      `${path}.requestedPositions`,
      decodePosition,
    ),
    acceptedPositions: array(
      proposal.acceptedPositions,
      `${path}.acceptedPositions`,
      decodePosition,
    ),
    changes: array(proposal.changes, `${path}.changes`, decodeChange),
    warehouseEpoch: entityId(proposal.warehouseEpoch, `${path}.warehouseEpoch`),
  };
}

function decodeAllocation(value: unknown, path: string): Allocation {
  const allocation = object(value, path);
  return {
    productID: id(allocation.productID, `${path}.productID`),
    batchID: id(allocation.batchID, `${path}.batchID`),
    quantity: positiveInt64(allocation.quantity, `${path}.quantity`),
  };
}

export function decodeOrder(value: unknown, path: string): Order {
  const order = object(value, path);
  return {
    orderID: id(order.orderID, `${path}.orderID`),
    proposalID: id(order.proposalID, `${path}.proposalID`),
    acceptedPositions: array(
      order.acceptedPositions,
      `${path}.acceptedPositions`,
      decodePosition,
    ),
    allocations: array(
      order.allocations,
      `${path}.allocations`,
      decodeAllocation,
    ),
    placedAt: instant(order.placedAt, `${path}.placedAt`),
  };
}

const resultKinds = [
  'OrderConfirmed',
  'RequiresConfirmation',
  'EmptyOrder',
  'ProposalSuperseded',
  'ConfirmationPending',
] as const;

export function decodeConfirmResult(
  value: unknown,
  path: string,
): ConfirmResult {
  const result = object(value, path);
  const kind = oneOf(result.kind, `${path}.kind`, resultKinds);
  switch (kind) {
    case 'OrderConfirmed':
      return { kind, order: decodeOrder(result.order, `${path}.order`) };
    case 'RequiresConfirmation':
      return {
        kind,
        proposal: decodeOrderProposal(result.proposal, `${path}.proposal`),
      };
    case 'EmptyOrder':
      return { kind };
    case 'ProposalSuperseded':
      return {
        kind,
        supersededBy: id(result.supersededBy, `${path}.supersededBy`),
      };
    case 'ConfirmationPending':
      return { kind };
  }
}
