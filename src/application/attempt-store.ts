import type { DeliveryInput } from '@/application/warehouse';
import type { DishInput, ProductInput } from '@/application/restaurant';

export type AttemptKind = 'delivery' | 'writeoff' | 'product' | 'dish';

// Where one attempt lives: the user, the restaurant and the operation. A
// write-off is one attempt per batch, the others one per restaurant.
export type AttemptRef =
  | {
      readonly kind: 'delivery' | 'product' | 'dish';
      readonly userID: string;
      readonly restaurantID: string;
    }
  | {
      readonly kind: 'writeoff';
      readonly userID: string;
      readonly restaurantID: string;
      readonly batchID: string;
    };

// What a resend needs besides the identity of the command.
export type AttemptBody =
  | {
      readonly kind: 'delivery';
      readonly payload: {
        readonly input: DeliveryInput;
        readonly timeZone: string;
      };
    }
  | {
      readonly kind: 'writeoff';
      readonly payload: { readonly batchID: string };
    }
  | { readonly kind: 'product'; readonly payload: ProductInput }
  | { readonly kind: 'dish'; readonly payload: DishInput };

export type AttemptRecord = AttemptBody & {
  readonly userID: string;
  readonly restaurantID: string;
  readonly commandID: string;
  // The runtime epoch the command was sent under, when it was known.
  readonly epoch: string | undefined;
  readonly startedAt: number;
};

// A record that cannot be read as a whole is `corrupt`: it is neither used
// nor removed, and it blocks the operation until it is discarded on purpose.
export type AttemptLoad =
  | { readonly status: 'ok'; readonly record: AttemptRecord }
  | { readonly status: 'absent' }
  | { readonly status: 'corrupt' }
  | { readonly status: 'unavailable' };

export interface AttemptEntry {
  readonly ref: AttemptRef;
  readonly result:
    | { readonly status: 'ok'; readonly record: AttemptRecord }
    | { readonly status: 'corrupt' };
}

export type AttemptList =
  | { readonly status: 'ok'; readonly entries: readonly AttemptEntry[] }
  | { readonly status: 'unavailable' };

export type AttemptWrite = 'ok' | 'unavailable';

// `refused`: the record is readable or missing, so only the owner's answer
// may settle it.
export type AttemptDiscard = 'ok' | 'refused' | 'unavailable';

export interface AttemptStore {
  load(ref: AttemptRef): AttemptLoad;
  // Every record of one user, in every restaurant; other users' records are
  // not read.
  list(userID: string): AttemptList;
  save(record: AttemptRecord): AttemptWrite;
  remove(ref: AttemptRef): AttemptWrite;
  // Removes only a record that is `corrupt`.
  discardCorrupt(ref: AttemptRef): AttemptDiscard;
}
