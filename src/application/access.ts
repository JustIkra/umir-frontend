import { failureOf, localFailure, type ApiFailure, type Settings } from './api';
import {
  permissionsFor,
  rolesInRestaurant,
  type Permission,
  type Role,
} from '@/domain/access';

export type OrgLifecycle = 'active' | 'deleting' | 'deleted';
export type RestaurantLifecycle =
  'registering' | 'ready' | 'deleting' | 'deleted';
export type StaffRoleName = 'Warehouse' | 'Waiter';

export interface AccessOrganization {
  readonly orgID: string;
  readonly name: string;
  readonly settings: Settings;
  readonly lifecycle: OrgLifecycle;
}

export interface AccessRestaurant {
  readonly restaurantID: string;
  readonly orgID: string;
  readonly name: string;
  readonly lifecycle: RestaurantLifecycle;
}

export interface AccessAssignment {
  readonly restaurantID: string;
  readonly roles: readonly StaffRoleName[];
}

export interface AccessMembership {
  readonly orgID: string;
  readonly orgRoles: readonly 'Admin'[];
  readonly assignments: readonly AccessAssignment[];
  readonly state: 'active' | 'revoked';
}

// GET /api/v2/access: the signed-in user's own memberships and what they
// reach. Gateway does not route it at the checkpoint (404).
export interface AccessView {
  readonly organizations: readonly AccessOrganization[];
  readonly restaurants: readonly AccessRestaurant[];
  readonly memberships: readonly AccessMembership[];
}

export interface AccessApi {
  access(): Promise<AccessView>;
}

export interface RestaurantAccess {
  readonly restaurantID: string;
  readonly orgID: string;
  readonly orgName: string;
  readonly name: string;
  readonly lifecycle: RestaurantLifecycle;
  readonly roles: readonly Role[];
  readonly permissions: ReadonlySet<Permission>;
  readonly timeZone: string;
}

export interface OrganizationAccess {
  readonly orgID: string;
  readonly name: string;
  readonly settings: Settings;
  readonly admin: boolean;
  readonly restaurants: readonly RestaurantAccess[];
}

// unverified: /access was refused or lost (404 at the checkpoint,
// AuthUnavailable). It never means «no access». previous is the last ready
// answer: rights and zone stay known while a refresh fails.
export type AccessState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly organizations: readonly OrganizationAccess[];
    }
  | {
      readonly status: 'unverified';
      readonly failure: ApiFailure;
      readonly previous?: readonly OrganizationAccess[];
    };

export interface AccessStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => AccessState;
  // Reads once; later calls return the known state.
  ensure(): Promise<AccessState>;
  refresh(): Promise<AccessState>;
  // The name of a restaurant seen in any earlier answer, for W15.
  nameOf(restaurantID: string): string | undefined;
  clear(): void;
}

// The restaurant /app opened last: a per-browser convenience.
export interface LastRestaurantStore {
  read(): string | undefined;
  write(restaurantID: string): void;
}

const byName = (a: { readonly name: string }, b: { readonly name: string }) =>
  a.name.localeCompare(b.name, 'ru');

export function organizationsFrom(
  view: AccessView,
): readonly OrganizationAccess[] {
  const result: OrganizationAccess[] = [];
  for (const organization of view.organizations) {
    if (organization.lifecycle !== 'active') continue;
    const membership = view.memberships.find(
      (item) => item.orgID === organization.orgID && item.state === 'active',
    );
    if (!membership) continue;
    const restaurants = view.restaurants
      .filter(
        (item) =>
          item.orgID === organization.orgID &&
          (item.lifecycle === 'ready' || item.lifecycle === 'registering'),
      )
      .map((item) => {
        const roles = rolesInRestaurant(membership, item);
        return {
          restaurantID: item.restaurantID,
          orgID: item.orgID,
          orgName: organization.name,
          name: item.name,
          lifecycle: item.lifecycle,
          roles,
          permissions: permissionsFor(roles),
          timeZone: organization.settings.timeZone,
        };
      })
      .filter(
        (item) => item.roles.length > 0 || item.lifecycle === 'registering',
      )
      .sort(byName);
    result.push({
      orgID: organization.orgID,
      name: organization.name,
      settings: organization.settings,
      admin: membership.orgRoles.includes('Admin'),
      restaurants,
    });
  }
  return result.sort(byName);
}

// The organizations of the last ready answer; undefined when none was read.
export function knownOrganizations(
  state: AccessState,
): readonly OrganizationAccess[] | undefined {
  if (state.status === 'ready') return state.organizations;
  return state.status === 'unverified' ? state.previous : undefined;
}

export function findRestaurant(
  state: AccessState,
  restaurantID: string,
): RestaurantAccess | undefined {
  if (state.status !== 'ready') return undefined;
  for (const organization of state.organizations) {
    const found = organization.restaurants.find(
      (item) => item.restaurantID === restaurantID,
    );
    if (found) return found;
  }
  return undefined;
}

export type EntryDecision =
  | { readonly kind: 'restaurant'; readonly restaurantID: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unverified'; readonly failure: ApiFailure };

// Where /app leads (spec section 10): the remembered restaurant, the first
// ready one, the first preparing one (W16), «Нет ресторанов» or W17.
export function chooseEntry(
  state: AccessState,
  remembered: string | undefined,
): EntryDecision {
  if (state.status !== 'ready') {
    if (remembered !== undefined) {
      return { kind: 'restaurant', restaurantID: remembered };
    }
    return {
      kind: 'unverified',
      failure:
        state.status === 'unverified'
          ? state.failure
          : localFailure('Malformed', 'unavailable'),
    };
  }
  const all = state.organizations.flatMap(
    (organization) => organization.restaurants,
  );
  const target =
    all.find(
      (item) => item.restaurantID === remembered && item.lifecycle === 'ready',
    ) ??
    all.find((item) => item.lifecycle === 'ready') ??
    all[0];
  return target
    ? { kind: 'restaurant', restaurantID: target.restaurantID }
    : { kind: 'none' };
}

export interface AccessStoreOptions {
  // 401 on /access: the session has likely ended. The answer is published
  // after this check, so an ended session leads to sign-in, not to W17.
  readonly onUnauthenticated?: () => Promise<unknown>;
}

export function createAccessStore(
  api: AccessApi,
  { onUnauthenticated }: AccessStoreOptions = {},
): AccessStore {
  const listeners = new Set<() => void>();
  const names = new Map<string, string>();
  let state: AccessState = { status: 'loading' };
  let loaded = false;
  let request: Promise<AccessState> | undefined;
  // clear() starts a new generation; answers of an older one are dropped.
  let generation = 0;

  function publish(next: AccessState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function load(): Promise<AccessState> {
    if (request) return request;
    const own = generation;
    request = api
      .access()
      .then(
        (view): AccessState => ({
          status: 'ready',
          organizations: organizationsFrom(view),
        }),
        async (error: unknown): Promise<AccessState> => {
          const failure =
            failureOf(error) ?? localFailure('Malformed', 'unavailable');
          // A failed check does not lose the answer.
          if (failure.status === 401) {
            await onUnauthenticated?.().catch(() => undefined);
          }
          const previous = knownOrganizations(state);
          return {
            status: 'unverified',
            failure,
            ...(previous === undefined ? {} : { previous }),
          };
        },
      )
      .then((next) => {
        if (own !== generation) return state;
        request = undefined;
        loaded = true;
        if (next.status === 'ready') {
          for (const organization of next.organizations) {
            for (const item of organization.restaurants) {
              names.set(item.restaurantID, item.name);
            }
          }
        }
        publish(next);
        return next;
      });
    return request;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    ensure: () => (loaded ? Promise.resolve(state) : load()),
    refresh: load,
    nameOf: (restaurantID) => names.get(restaurantID),
    clear() {
      generation += 1;
      request = undefined;
      loaded = false;
      names.clear();
      publish({ status: 'loading' });
    },
  };
}
