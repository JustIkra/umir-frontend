import type { RestaurantAccess, StaffRoleName } from '@/application/access';
import {
  sortedRoles,
  type Outcome,
  type SaveAssignmentsOutcome,
} from '@/application/organization-commands';
import type {
  DurableResult,
  Member,
  RoleGrant,
} from '@/application/organizations';
import { roleTitle } from '@/presentation/app-shell/shell-context';
import { matchesQuery } from '@/presentation/ui/search';

// The lines under a member's name (MB01) and in the list of the revoke
// dialog (RV01). A restaurant that access does not list (deleted) is left out.
export function assignmentLines(
  member: Member,
  restaurants: readonly RestaurantAccess[],
): readonly string[] {
  const { orgRoles, assignments } = member.membership;
  if (orgRoles.includes('Admin')) {
    return ['Администратор организации · все рестораны'];
  }
  return restaurants.flatMap((restaurant) => {
    const assignment = assignments.find(
      (candidate) => candidate.restaurantID === restaurant.restaurantID,
    );
    const roles = sortedRoles(assignment?.roles ?? []);
    return roles.length > 0
      ? [`${restaurant.name} — ${roles.map(roleTitle).join(', ')}`]
      : [];
  });
}

// MB02: by the name and the address, ignoring case.
export function filterMembers(
  members: readonly Member[],
  query: string,
): readonly Member[] {
  return members.filter((member) =>
    matchesQuery(query, member.displayName, member.email ?? ''),
  );
}

// The roles the member holds now: the first value of the matrix.
export function grantsOf(member: Member): readonly RoleGrant[] {
  return member.membership.assignments.flatMap((assignment) => {
    const roles = sortedRoles(assignment.roles);
    return roles.length > 0
      ? [{ restaurantID: assignment.restaurantID, roles }]
      : [];
  });
}

// The matrix offers restaurants that are ready or still preparing: Auth takes
// an assignment to a preparing restaurant, and the deleted ones are gone.
export function editableRestaurants(
  restaurants: readonly RestaurantAccess[],
): ReadonlySet<string> {
  return new Set(
    restaurants
      .filter(
        (restaurant) =>
          restaurant.lifecycle === 'ready' ||
          restaurant.lifecycle === 'registering',
      )
      .map((restaurant) => restaurant.restaurantID),
  );
}

// One box of the matrix: the grants with the role of the restaurant set or
// cleared. A restaurant without roles has no grant.
export function toggleRole(
  value: readonly RoleGrant[],
  restaurantID: string,
  role: StaffRoleName,
  on: boolean,
): readonly RoleGrant[] {
  const current =
    value.find((grant) => grant.restaurantID === restaurantID)?.roles ?? [];
  const roles = sortedRoles(
    on
      ? [...current.filter((item) => item !== role), role]
      : current.filter((item) => item !== role),
  );
  const rest = value.filter((grant) => grant.restaurantID !== restaurantID);
  const exists = value.some((grant) => grant.restaurantID === restaurantID);
  if (roles.length === 0) return rest;
  if (!exists) return [...rest, { restaurantID, roles }];
  return value.map((grant) =>
    grant.restaurantID === restaurantID ? { restaurantID, roles } : grant,
  );
}

// MM02: the restaurants whose roles differ from the stored ones.
export function changedRestaurants(
  stored: readonly RoleGrant[],
  draft: readonly RoleGrant[],
): ReadonlySet<string> {
  const rolesOf = (grants: readonly RoleGrant[], restaurantID: string) =>
    sortedRoles(
      grants.find((grant) => grant.restaurantID === restaurantID)?.roles ?? [],
    ).join();
  const ids = new Set([...stored, ...draft].map((grant) => grant.restaurantID));
  return new Set(
    [...ids].filter(
      (restaurantID) =>
        rolesOf(stored, restaurantID) !== rolesOf(draft, restaurantID),
    ),
  );
}

export type AssignmentsState =
  | { readonly kind: 'view' } // MM01
  | { readonly kind: 'changed' } // MM02
  | { readonly kind: 'saving' } // MM03
  | { readonly kind: 'saved' } // MM04
  | { readonly kind: 'no-roles' } // MM05
  | { readonly kind: 'conflict' } // MM06
  | { readonly kind: 'unavailable' } // MM07
  | { readonly kind: 'unknown' } // MM08
  | { readonly kind: 'last-admin' }
  | { readonly kind: 'forbidden' };

export interface AssignmentsMessage {
  readonly title?: string;
  readonly text: string;
  readonly tone: 'success' | 'error' | 'info';
}

const notSaved = 'Назначения не сохранены';

// What the frames MM02 to MM08 say. The view state has no message.
export function assignmentsMessage(
  state: AssignmentsState,
): AssignmentsMessage | undefined {
  switch (state.kind) {
    case 'view':
      return undefined;
    case 'changed':
      return { text: 'Есть несохранённые изменения.', tone: 'info' };
    case 'saving':
      return { text: 'Сохраняем…', tone: 'info' };
    case 'saved':
      return {
        title: 'Назначения сохранены',
        text: 'Изменения вступят в силу при следующем обновлении прав участника.',
        tone: 'success',
      };
    case 'no-roles':
      return {
        title: notSaved,
        text: 'Не выбрано ни одной роли. Выберите хотя бы одну роль или используйте «Отозвать доступ», чтобы закрыть доступ полностью.',
        tone: 'error',
      };
    case 'conflict':
      return {
        title: notSaved,
        text: 'После открытия формы назначения участника изменились — например, в другой вкладке. Обновите форму и внесите изменения повторно.',
        tone: 'error',
      };
    case 'unavailable':
      return {
        title: notSaved,
        text: 'Сервис авторизации не отвечает. Выбор сохранён в форме, повторите сохранение через несколько минут.',
        tone: 'error',
      };
    case 'unknown':
      return {
        title: 'Результат сохранения неизвестен',
        text: 'Ответ сервиса не получен. Назначения могли измениться. Проверка продолжит ту же попытку.',
        tone: 'info',
      };
    case 'last-admin':
      return {
        title: notSaved,
        text: 'В организации должен остаться хотя бы один администратор.',
        tone: 'error',
      };
    case 'forbidden':
      return {
        title: notSaved,
        text: 'Изменять назначения может администратор организации.',
        tone: 'error',
      };
  }
}

// The frame after the answer of Auth to «Сохранить назначения». A refusal
// without a frame of its own means the roles were not saved and Auth did not
// answer in time (MM07).
export function assignmentsOutcomeState(
  outcome: SaveAssignmentsOutcome,
): AssignmentsState {
  switch (outcome.kind) {
    case 'unchanged':
    case 'ended':
      return { kind: 'view' };
    case 'saved':
      return { kind: 'saved' };
    case 'no-roles':
      return { kind: 'no-roles' };
    // A membership that is gone is the same news as one that moved on: the
    // list is read again and the card shows what is left.
    case 'conflict':
    case 'gone':
      return { kind: 'conflict' };
    case 'last-admin':
      return { kind: 'last-admin' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'unknown':
      return { kind: 'unknown' };
    case 'invalid':
    case 'invited':
    case 'closed':
    case 'limited':
    case 'delivery':
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}

export type RevokeState =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'revoking' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'already' }
  | { readonly kind: 'last-admin' }
  // CommandConflict with the member still in the list: the data moved on.
  | { readonly kind: 'changed' }
  | { readonly kind: 'forbidden' };

export interface RevokeMessage {
  readonly title: string;
  readonly text: string;
}

const notRevoked = 'Доступ не отозван';

// What the frames RV04 to RV06 say in the dialog. The confirmation and the
// progress have their own copy in the dialog (it names the organization).
export function revokeMessage(
  state: RevokeState,
  name: string,
): RevokeMessage | undefined {
  switch (state.kind) {
    case 'confirm':
    case 'revoking':
      return undefined;
    case 'unavailable':
      return {
        title: notRevoked,
        text: 'Сервис авторизации не отвечает. Повторите через несколько минут.',
      };
    case 'unknown':
      return {
        title: 'Результат отзыва неизвестен',
        text: 'Ответ сервиса не получен. Доступ мог быть отозван. Проверка продолжит ту же попытку.',
      };
    case 'already':
      return {
        title: 'Доступ уже отозван',
        text: `Доступ участника ${name} к организации был отозван ранее — например, в другой вкладке.`,
      };
    case 'changed':
      return {
        title: notRevoked,
        text: 'Данные участника изменились. Закройте окно и повторите.',
      };
    case 'last-admin':
      return {
        title: notRevoked,
        text: 'В организации должен остаться хотя бы один администратор.',
      };
    case 'forbidden':
      return {
        title: notRevoked,
        text: 'Отзывать доступ может администратор организации.',
      };
  }
}

// The router state a revoke leaves for the list: the name of the member.
export interface RevokedState {
  readonly revoked: string;
}

export function revokedName(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const name: unknown = (state as { revoked?: unknown }).revoked;
  return typeof name === 'string' ? name : undefined;
}

// RV03: the notice over the list after the member was removed.
export function revokedNotice(name: string): RevokeMessage {
  return {
    title: `Доступ участника ${name} отозван`,
    text: 'Назначения участника в организации закрыты. Учётная запись сохранена.',
  };
}

// The answer of Auth to «Отозвать доступ»: 'done' leaves for the list, a
// refusal is a frame of the dialog. A conflict is resolved by the dialog
// against the list read again: no member is RV06, a member is 'changed'.
export function revokeOutcomeState(
  outcome: Outcome<DurableResult>,
): RevokeState | 'done' {
  switch (outcome.kind) {
    case 'done':
      return 'done';
    case 'conflict':
      return { kind: 'changed' };
    case 'gone':
      return { kind: 'already' };
    case 'last-admin':
      return { kind: 'last-admin' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'unknown':
      return { kind: 'unknown' };
    case 'ended':
      return { kind: 'confirm' };
    case 'invalid':
    case 'invited':
    case 'closed':
    case 'limited':
    case 'delivery':
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}
