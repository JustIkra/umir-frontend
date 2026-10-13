// Shared types of the backend v2 public contract as the application sees
// them. Adapters decode wire JSON into these types; nothing here performs IO.

export type Outcome =
  'committed' | 'not_committed' | 'unknown' | 'unavailable' | 'indeterminate';

// An RFC 3339 instant: the text as sent and the moment it names. Adapters
// compute epochMs; domain and application never parse dates themselves.
export interface Instant {
  readonly iso: string;
  readonly epochMs: number;
}

export type Service = 'warehouse' | 'serving';

// Topics of the live stream's change events.
export type Topic = 'catalog' | 'stock' | 'menu' | 'orders' | 'analytics';

export interface Settings {
  readonly timeZone: string;
  readonly settingsVersion: string;
}

// The context of every warehouse and serving read. warehouseEpoch comes only
// from serving.
export interface BusinessContext {
  readonly orgID: string;
  readonly tenantID: string;
  readonly runtimeEpoch: string;
  readonly warehouseEpoch: string | undefined;
  readonly settings: Settings;
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
}

export interface Envelope<T> {
  readonly context: BusinessContext;
  readonly result: T;
}

// A refused or lost request. Codes come from the contract's #Error; the
// client adds Transport (no answer), Malformed (an answer that is not the
// contract's) and EpochUnknown (a command before any read of its service).
export interface ApiFailure {
  readonly status: number;
  readonly code: string;
  readonly outcome: Outcome;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly currentEpoch: string | undefined;
  readonly fieldErrors: Readonly<Partial<Record<string, string>>>;
  readonly sessionRevoked: boolean;
}

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(`${String(failure.status)} ${failure.code}`);
    this.name = 'ApiError';
    this.failure = failure;
  }
}

export function failureOf(error: unknown): ApiFailure | undefined {
  return error instanceof ApiError ? error.failure : undefined;
}

export function localFailure(
  code: string,
  outcome: Outcome,
  status = 0,
): ApiFailure {
  return {
    status,
    code,
    outcome,
    retryable: true,
    retryAfterSeconds: undefined,
    currentEpoch: undefined,
    fieldErrors: {},
    sessionRevoked: false,
  };
}
