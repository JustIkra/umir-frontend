import {
  ApiError,
  localFailure,
  type ApiFailure,
  type Outcome,
} from '@/application/api';
import { decodeCsrfToken } from '@/adapters/api/decode/account';
import { DecodeError, decodeFailure } from '@/adapters/api/decode/common';
import { activityHeader } from './read-request';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SendOptions {
  readonly body?: unknown;
  readonly epoch?: string | undefined;
}

// Browser access to gateway. Reads resolve to the parsed JSON body; writes
// carry the CSRF token and, for warehouse and serving, the runtime epoch.
// Every refusal or loss rejects with ApiError.
export interface GatewayClient {
  read(
    path: string,
    options: { readonly background: boolean },
  ): Promise<unknown>;
  send(method: Method, path: string, options?: SendOptions): Promise<unknown>;
  setCsrfToken(token: string): void;
  clearCsrfToken(): void;
}

export const csrfPath = '/api/v2/csrf';
export const csrfHeader = 'X-CSRF-Token';
export const epochHeader = 'X-Umir-Runtime-Epoch';

// Without a contract answer, a read changed nothing and a write may have been
// recorded.
function lostOutcome(method: string): Outcome {
  return method === 'GET' ? 'unavailable' : 'unknown';
}

async function body(response: Response): Promise<unknown> {
  const text = await response.text();
  return text === '' ? undefined : (JSON.parse(text) as unknown);
}

export function createGatewayClient(fetch: FetchLike): GatewayClient {
  let csrfToken: string | undefined;

  async function exchange(
    method: string,
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        method,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new ApiError(localFailure('Transport', lostOutcome(method)));
    }
    let parsed: unknown;
    try {
      parsed = await body(response);
    } catch {
      throw new ApiError(
        localFailure('Malformed', lostOutcome(method), response.status),
      );
    }
    if (response.ok) return parsed;
    let failure: ApiFailure;
    try {
      failure = decodeFailure(response.status, parsed);
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      failure = localFailure('Malformed', lostOutcome(method), response.status);
    }
    throw new ApiError(failure);
  }

  async function refreshCsrf(): Promise<string> {
    const answer = await exchange('GET', csrfPath, {
      headers: { Accept: 'application/json' },
    });
    try {
      csrfToken = decodeCsrfToken(answer);
    } catch {
      throw new ApiError(localFailure('Malformed', 'unavailable', 200));
    }
    return csrfToken;
  }

  function sendOnce(
    method: Method,
    path: string,
    token: string,
    { body: payload, epoch }: SendOptions,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [csrfHeader]: token,
    };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (epoch !== undefined) headers[epochHeader] = epoch;
    return exchange(method, path, {
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }

  return {
    read(path, { background }) {
      return exchange('GET', path, {
        headers: {
          Accept: 'application/json',
          ...(background ? { [activityHeader]: 'background' } : {}),
        },
      });
    },
    async send(method, path, options = {}) {
      const token = csrfToken ?? (await refreshCsrf());
      try {
        return await sendOnce(method, path, token, options);
      } catch (error) {
        // A rejected token is not_committed: one resend with a fresh token is
        // safe.
        if (
          !(error instanceof ApiError) ||
          error.failure.code !== 'InvalidCsrfToken'
        ) {
          throw error;
        }
        return sendOnce(method, path, await refreshCsrf(), options);
      }
    },
    setCsrfToken(token) {
      csrfToken = token;
    },
    clearCsrfToken() {
      csrfToken = undefined;
    },
  };
}
