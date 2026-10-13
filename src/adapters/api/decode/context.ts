import type { BusinessContext, Envelope } from '@/application/api';
import {
  entityId,
  instant,
  nonNegativeInt64,
  object,
  positiveInt64,
  string,
} from './common';

export function decodeContext(value: unknown, path: string): BusinessContext {
  const context = object(value, path);
  const settings = object(context.settings, `${path}.settings`);
  return {
    orgID: entityId(context.orgID, `${path}.orgID`),
    tenantID: entityId(context.tenantID, `${path}.tenantID`),
    runtimeEpoch: entityId(context.runtimeEpoch, `${path}.runtimeEpoch`),
    warehouseEpoch:
      context.warehouseEpoch === undefined
        ? undefined
        : entityId(context.warehouseEpoch, `${path}.warehouseEpoch`),
    settings: {
      timeZone: string(settings.timeZone, `${path}.settings.timeZone`),
      settingsVersion: positiveInt64(
        settings.settingsVersion,
        `${path}.settings.settingsVersion`,
      ),
    },
    evaluatedAt: instant(context.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      context.stateVersion,
      `${path}.stateVersion`,
    ),
  };
}

// {context, result} of every warehouse and serving read.
export function decodeEnvelope<T>(
  body: unknown,
  result: (value: unknown, path: string) => T,
): Envelope<T> {
  const envelope = object(body, 'envelope');
  return {
    context: decodeContext(envelope.context, 'context'),
    result: result(envelope.result, 'result'),
  };
}
