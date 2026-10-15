import type { BusinessContext, Envelope } from '@/application/api';
import type {
  HistoryCoverage,
  PlanningCapture,
  PlanningWindow,
} from '@/application/planning';
import type { SupplyRow, SupplySuggestions } from '@/application/warehouse';
import { baseUnits } from '@/domain/quantity';
import {
  array,
  boolean,
  closedObject,
  decimal6,
  DecodeError,
  entityId,
  exactNumber,
  instant,
  instantNanos,
  nonEmptyString,
  nonNegativeInt64,
  oneOf,
  positiveInt64,
} from './common';
import { decodeContext } from './context';

export function decodePlanningWindow(
  value: unknown,
  path: string,
): PlanningWindow {
  const v = closedObject(value, path, ['from', 'to', 'days']);
  return {
    from: instant(v.from, `${path}.from`),
    to: instant(v.to, `${path}.to`),
    days: exactNumber(v.days, `${path}.days`, 7),
  };
}

export function decodeCoverage(value: unknown, path: string): HistoryCoverage {
  const v = closedObject(value, path, [
    'epoch',
    'coverageFrom',
    'complete',
    'requestedFrom',
    'availableFrom',
  ]);
  return {
    epoch: entityId(v.epoch, `${path}.epoch`),
    coverageFrom: instant(v.coverageFrom, `${path}.coverageFrom`),
    complete: boolean(v.complete, `${path}.complete`),
    requestedFrom: instant(v.requestedFrom, `${path}.requestedFrom`),
    availableFrom: instant(v.availableFrom, `${path}.availableFrom`),
  };
}

export function validatePlanningCapture(
  context: BusinessContext,
  value: PlanningCapture,
  service: 'warehouse' | 'serving',
): void {
  const at = instantNanos(context.evaluatedAt);
  const from = at - 168n * 3600n * 1_000_000_000n;
  const coverage = value.coverage;
  const coverageFrom = instantNanos(coverage.coverageFrom);
  const epoch =
    service === 'serving' ? context.warehouseEpoch : context.runtimeEpoch;
  if (
    epoch === undefined ||
    epoch !== coverage.epoch ||
    value.stateVersion !== context.stateVersion ||
    instantNanos(value.evaluatedAt) !== at ||
    instantNanos(value.window.to) !== at ||
    instantNanos(value.window.from) !== from ||
    coverageFrom > at ||
    coverage.complete !== coverageFrom <= from ||
    instantNanos(coverage.requestedFrom) !== from ||
    instantNanos(coverage.availableFrom) !==
      (coverageFrom > from ? coverageFrom : from)
  )
    throw new DecodeError('context', 'inconsistent planning capture');
}

export function decodePlanningEnvelope<T extends PlanningCapture>(
  body: unknown,
  result: (value: unknown, path: string) => T,
  service: 'warehouse' | 'serving',
): Envelope<T> {
  const envelope = closedObject(body, 'envelope', ['context', 'result']);
  const contextFields = closedObject(envelope.context, 'context', [
    'orgID',
    'tenantID',
    'runtimeEpoch',
    'settings',
    'evaluatedAt',
    'stateVersion',
    ...(service === 'serving' ? ['warehouseEpoch'] : []),
  ]);
  closedObject(contextFields.settings, 'context.settings', [
    'timeZone',
    'settingsVersion',
  ]);
  const context = decodeContext(contextFields, 'context');
  const value = result(envelope.result, 'result');
  validatePlanningCapture(context, value, service);
  return { context, result: value };
}

function decodeSupplyRow(value: unknown, path: string): SupplyRow {
  const v = closedObject(value, path, [
    'productID',
    'productName',
    'baseUnit',
    'availableQuantity',
    'consumedQuantity',
    'averageDailyBaseUnits',
    'coverageDays',
    'onePortionDeficit',
    'suggestedQuantity',
    'blockedDishIDs',
    'reasons',
  ]);
  const consumedQuantity = nonNegativeInt64(
    v.consumedQuantity,
    `${path}.consumedQuantity`,
  );
  const coverageDays =
    v.coverageDays === null
      ? null
      : decimal6(v.coverageDays, `${path}.coverageDays`);
  const averageDailyBaseUnits = decimal6(
    v.averageDailyBaseUnits,
    `${path}.averageDailyBaseUnits`,
  );
  const blockedDishIDs = array(
    v.blockedDishIDs,
    `${path}.blockedDishIDs`,
    nonEmptyString,
  );
  const reasons = array(v.reasons, `${path}.reasons`, (v, p) =>
    oneOf(v, p, ['low_coverage', 'stop_list_deficit']),
  );
  if (
    (consumedQuantity === '0') !== (coverageDays === null) ||
    (consumedQuantity === '0' && averageDailyBaseUnits !== '0.000000') ||
    blockedDishIDs.length > 500 ||
    new Set(blockedDishIDs).size !== blockedDishIDs.length ||
    reasons.length < 1 ||
    reasons.length > 2 ||
    new Set(reasons).size !== reasons.length
  )
    throw new DecodeError(path, 'inconsistent supply row');
  return {
    productID: nonEmptyString(v.productID, `${path}.productID`),
    productName: nonEmptyString(v.productName, `${path}.productName`),
    baseUnit: oneOf(v.baseUnit, `${path}.baseUnit`, baseUnits),
    availableQuantity: nonNegativeInt64(
      v.availableQuantity,
      `${path}.availableQuantity`,
    ),
    consumedQuantity,
    averageDailyBaseUnits,
    coverageDays,
    onePortionDeficit: nonNegativeInt64(
      v.onePortionDeficit,
      `${path}.onePortionDeficit`,
    ),
    suggestedQuantity: positiveInt64(
      v.suggestedQuantity,
      `${path}.suggestedQuantity`,
    ),
    blockedDishIDs,
    reasons,
  };
}

export function decodeSupplySuggestions(
  value: unknown,
  path: string,
): SupplySuggestions {
  const v = closedObject(value, path, [
    'evaluatedAt',
    'stateVersion',
    'policy',
    'window',
    'coverage',
    'items',
  ]);
  const policy = closedObject(v.policy, `${path}.policy`, [
    'version',
    'historyDays',
    'coverageThresholdDays',
    'targetDays',
  ]);
  const items = array(v.items, `${path}.items`, decodeSupplyRow);
  if (
    items.length > 500 ||
    new Set(items.map((item) => item.productID)).size !== items.length
  )
    throw new DecodeError(path, 'duplicate or oversized supply result');
  return {
    evaluatedAt: instant(v.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(v.stateVersion, `${path}.stateVersion`),
    policy: {
      version: oneOf(policy.version, `${path}.policy.version`, ['FIN1']),
      historyDays: exactNumber(
        policy.historyDays,
        `${path}.policy.historyDays`,
        7,
      ),
      coverageThresholdDays: exactNumber(
        policy.coverageThresholdDays,
        `${path}.policy.coverageThresholdDays`,
        3,
      ),
      targetDays: exactNumber(
        policy.targetDays,
        `${path}.policy.targetDays`,
        7,
      ),
    },
    window: decodePlanningWindow(v.window, `${path}.window`),
    coverage: decodeCoverage(v.coverage, `${path}.coverage`),
    items,
  };
}
