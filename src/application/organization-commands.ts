import type { StaffRoleName } from './access';
import type { ApiFailure } from './api';
import type { CommandResult, CommandRunner } from './commands';
import type {
  Assignment,
  DurableResult,
  Invitation,
  Lifecycle,
  Member,
  Membership,
  NewOrganization,
  OrganizationProfile,
  OrganizationsApi,
  RoleGrant,
} from './organizations';

// What a screen is told about a command of organization administration.
// 'unknown' keeps the attempt: the same call again checks it with the same
// commandID and never sends a new command.
export type Refusal =
  | {
      readonly kind: 'invalid';
      // The code of Auth: UnknownTimeZone names the zone, InvalidArgument
      // says nothing about the field.
      readonly code: string;
      readonly fields: Readonly<Partial<Record<string, string>>>;
    }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'last-admin' }
  // The address already has a pending invitation (IV04).
  | { readonly kind: 'invited' }
  // The invitation no longer waits to be accepted: accepted, cancelled or
  // expired. The screen learns which from the invitations read again.
  | { readonly kind: 'closed' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'limited'; readonly seconds: number }
  | { readonly kind: 'delivery' }
  | { readonly kind: 'unavailable'; readonly code: string }
  | { readonly kind: 'unknown'; readonly code: string }
  | { readonly kind: 'ended' };

export type Outcome<T> = { readonly kind: 'done'; readonly value: T } | Refusal;

// The roles of a restaurant in the contract's order; the contract rejects a
// repeated role.
const roleOrder: readonly StaffRoleName[] = ['Warehouse', 'Waiter'];

export function sortedRoles(
  roles: readonly StaffRoleName[],
): readonly StaffRoleName[] {
  return roleOrder.filter((role) => roles.includes(role));
}

export type AssignmentPlan =
  | { readonly kind: 'none' }
  // Only whole assignments go: each is revoked on its own version, so a
  // newer replacement is never revoked by mistake.
  | { readonly kind: 'revoke'; readonly assignments: readonly Assignment[] }
  // Anything else replaces the assignment set under the membership version.
  | { readonly kind: 'replace'; readonly grants: readonly RoleGrant[] };

const sameRoles = (
  left: readonly StaffRoleName[],
  right: readonly StaffRoleName[],
) => left.length === right.length && left.every((role, i) => role === right[i]);

// editable: restaurants the matrix shows (ready or preparing). Assignments to
// other restaurants are neither compared nor sent: the contract refuses an
// assignment to a restaurant that is not active.
export function planAssignments(
  membership: Membership,
  desired: readonly RoleGrant[],
  editable: ReadonlySet<string>,
): AssignmentPlan {
  const wanted = new Map<string, readonly StaffRoleName[]>();
  for (const grant of desired) {
    const roles = sortedRoles(grant.roles);
    if (roles.length > 0 && editable.has(grant.restaurantID)) {
      wanted.set(grant.restaurantID, roles);
    }
  }
  const current = membership.assignments.filter((assignment) =>
    editable.has(assignment.restaurantID),
  );
  const removed = current.filter(
    (assignment) => !wanted.has(assignment.restaurantID),
  );
  const changed = [...wanted].some(([restaurantID, roles]) => {
    const existing = current.find(
      (assignment) => assignment.restaurantID === restaurantID,
    );
    return existing === undefined || !sameRoles(existing.roles, roles);
  });
  if (!changed && removed.length === 0) return { kind: 'none' };
  if (!changed) return { kind: 'revoke', assignments: removed };
  return {
    kind: 'replace',
    grants: [...wanted].map(([restaurantID, roles]) => ({
      restaurantID,
      roles,
    })),
  };
}

export type SaveAssignmentsOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'saved' }
  // A member who is not an administrator keeps no role in any restaurant
  // (MM05): nothing is sent.
  | { readonly kind: 'no-roles' }
  | Refusal;

export interface OrganizationCommandsOptions {
  readonly api: OrganizationsApi;
  readonly commands: CommandRunner;
  // The shape of the world changed (organizations, restaurants, the zone):
  // access is read again.
  readonly accessChanged: () => void;
  readonly membersChanged: (orgID: string) => void;
  readonly invitationsChanged: (orgID: string) => void;
  // The zone was saved or found changed: the profile is read again.
  readonly profileChanged: (orgID: string) => void;
  // A creation or a deletion was accepted: its progress is followed.
  readonly started: (
    kind: OperationKind,
    name: string,
    lifecycle: Lifecycle,
  ) => void;
  readonly onUnauthenticated: () => void;
}

export type OperationKind =
  | 'create-organization'
  | 'create-restaurant'
  | 'delete-restaurant'
  | 'delete-organization';

export interface OrganizationCommands {
  createOrganization(input: NewOrganization): Promise<Outcome<Lifecycle>>;
  addRestaurant(orgID: string, name: string): Promise<Outcome<Lifecycle>>;
  deleteRestaurant(
    orgID: string,
    restaurantID: string,
    name: string,
  ): Promise<Outcome<Lifecycle>>;
  deleteOrganization(orgID: string, name: string): Promise<Outcome<Lifecycle>>;
  setTimeZone(
    orgID: string,
    timeZone: string,
    expectedVersion: string,
  ): Promise<Outcome<OrganizationProfile>>;
  saveAssignments(
    member: Member,
    desired: readonly RoleGrant[],
    editable: ReadonlySet<string>,
  ): Promise<SaveAssignmentsOutcome>;
  setAdmin(
    member: Member,
    admin: boolean,
    editable: ReadonlySet<string>,
  ): Promise<Outcome<Membership>>;
  revokeMember(member: Member): Promise<Outcome<DurableResult>>;
  invite(
    orgID: string,
    email: string,
    grants: readonly RoleGrant[],
  ): Promise<Outcome<Invitation>>;
  resendLink(
    orgID: string,
    invitationID: string,
  ): Promise<Outcome<DurableResult>>;
  cancelInvitation(
    orgID: string,
    invitationID: string,
  ): Promise<Outcome<DurableResult>>;
  // True while a command of that key has no known outcome.
  isPending(key: string): boolean;
  // The input of the creation that has no known outcome: the attempt that is
  // checked is the one sent with it, whatever a screen holds now.
  pendingOrganization(): NewOrganization | undefined;
  pendingRestaurantName(orgID: string): string | undefined;
}

export const orgKeys = {
  createOrganization: 'org.create',
  addRestaurant: (orgID: string) => `org.restaurant.add.${orgID}`,
  deleteRestaurant: (restaurantID: string) =>
    `org.restaurant.delete.${restaurantID}`,
  deleteOrganization: (orgID: string) => `org.delete.${orgID}`,
  setTimeZone: (orgID: string) => `org.zone.${orgID}`,
  updateMembership: (membershipID: string) => `org.member.save.${membershipID}`,
  revokeMembership: (membershipID: string) =>
    `org.member.revoke.${membershipID}`,
  revokeAssignment: (assignmentID: string) =>
    `org.assignment.revoke.${assignmentID}`,
  invite: (orgID: string) => `org.invite.${orgID}`,
  resendLink: (invitationID: string) => `org.invitation.link.${invitationID}`,
  cancelInvitation: (invitationID: string) =>
    `org.invitation.cancel.${invitationID}`,
} as const;

const defaultWaitSeconds = 60;

// What a refusal means depends on the operation: Auth answers 404 NotFound
// to a closed invitation and 409 CommandConflict to an address that already
// has one, but 409 CommandConflict to a moved membership.
export type RefusalScope =
  'organization' | 'membership' | 'invitation' | 'invite';

// What Auth's refusals mean to the screens (the Figma frames of OG, MB, IN).
export function refusalOf(failure: ApiFailure, scope: RefusalScope): Refusal {
  if (failure.status === 401 || failure.code === 'Unauthenticated') {
    return { kind: 'ended' };
  }
  if (failure.status === 429 || failure.code === 'RateLimited') {
    return {
      kind: 'limited',
      seconds: failure.retryAfterSeconds ?? defaultWaitSeconds,
    };
  }
  switch (failure.code) {
    case 'InvalidArgument':
    case 'InvalidRequest':
    case 'UnknownTimeZone':
      return {
        kind: 'invalid',
        code: failure.code,
        fields: failure.fieldErrors,
      };
    case 'CommandConflict':
      return scope === 'invite' ? { kind: 'invited' } : { kind: 'conflict' };
    case 'SettingsChanged':
      return { kind: 'conflict' };
    case 'LastAdmin':
      return { kind: 'last-admin' };
    case 'Forbidden':
      return { kind: 'forbidden' };
    case 'NotFound':
      return scope === 'invitation' ? { kind: 'closed' } : { kind: 'gone' };
    case 'ScopeDeleted':
      return { kind: 'gone' };
    case 'DeliveryUnavailable':
      return { kind: 'delivery' };
    default:
      return { kind: 'unavailable', code: failure.code };
  }
}

interface Unsettled {
  readonly name: string;
  readonly organization?: NewOrganization;
}

export function createOrganizationCommands({
  api,
  commands,
  accessChanged,
  membersChanged,
  invitationsChanged,
  profileChanged,
  started,
  onUnauthenticated,
}: OrganizationCommandsOptions): OrganizationCommands {
  function outcome<T>(
    result: CommandResult<T>,
    scope: RefusalScope,
  ): Outcome<T> {
    switch (result.kind) {
      case 'committed':
        return { kind: 'done', value: result.value };
      case 'unknown':
        return { kind: 'unknown', code: result.failure.code };
      case 'reset':
        return { kind: 'unavailable', code: result.failure.code };
      case 'rejected': {
        const refusal = refusalOf(result.failure, scope);
        if (refusal.kind === 'ended') onUnauthenticated();
        return refusal;
      }
    }
  }

  const isPending = (key: string) =>
    commands.getSnapshot().some((attempt) => attempt.key === key);

  // What the attempt of a key was sent with, while it has no known outcome.
  // A call made meanwhile resends that attempt, so it is the name of the
  // attempt, not the one of the new call, that the tracker is told.
  const unsettled = new Map<string, Unsettled>();

  async function lifecycle(
    kind: OperationKind,
    given: Unsettled,
    key: string,
    label: string,
    execute: (commandID: string) => Promise<Lifecycle>,
  ): Promise<Outcome<Lifecycle>> {
    const sent = (isPending(key) ? unsettled.get(key) : undefined) ?? given;
    unsettled.set(key, sent);
    const result = outcome(
      await commands.run({ key, label, execute }),
      'organization',
    );
    if (result.kind !== 'unknown') unsettled.delete(key);
    if (result.kind === 'done') {
      accessChanged();
      started(kind, sent.name, result.value);
    }
    return result;
  }

  return {
    createOrganization: (input) =>
      lifecycle(
        'create-organization',
        { name: input.name, organization: input },
        orgKeys.createOrganization,
        'создания организации',
        (commandID) => api.createOrganization(input, commandID),
      ),
    addRestaurant: (orgID, name) =>
      lifecycle(
        'create-restaurant',
        { name },
        orgKeys.addRestaurant(orgID),
        'добавления ресторана',
        (commandID) => api.createRestaurant(orgID, name, commandID),
      ),
    deleteRestaurant: (orgID, restaurantID, name) =>
      lifecycle(
        'delete-restaurant',
        { name },
        orgKeys.deleteRestaurant(restaurantID),
        'удаления ресторана',
        (commandID) => api.deleteRestaurant(orgID, restaurantID, commandID),
      ),
    deleteOrganization: (orgID, name) =>
      lifecycle(
        'delete-organization',
        { name },
        orgKeys.deleteOrganization(orgID),
        'удаления организации',
        (commandID) => api.deleteOrganization(orgID, commandID),
      ),
    async setTimeZone(orgID, timeZone, expectedVersion) {
      const result = outcome(
        await commands.run({
          key: orgKeys.setTimeZone(orgID),
          label: 'смены часового пояса',
          execute: (commandID) =>
            api.updateSettings(orgID, { timeZone, expectedVersion }, commandID),
        }),
        'organization',
      );
      // A conflict carries no current settings: the profile is read again.
      if (result.kind === 'done' || result.kind === 'conflict') {
        accessChanged();
        profileChanged(orgID);
      }
      return result;
    },
    async saveAssignments(member, desired, editable) {
      const { membership } = member;
      const roles = desired.some(
        (grant) => editable.has(grant.restaurantID) && grant.roles.length > 0,
      );
      if (!roles && !membership.orgRoles.includes('Admin')) {
        return { kind: 'no-roles' };
      }
      const plan = planAssignments(membership, desired, editable);
      if (plan.kind === 'none') return { kind: 'unchanged' };
      let result: Outcome<unknown>;
      // A revoke that committed changes the membership even when a later
      // step fails: the list must be read again then.
      let committed = false;
      if (plan.kind === 'replace') {
        result = outcome(
          await commands.run({
            key: orgKeys.updateMembership(membership.membershipID),
            label: 'изменения назначений',
            execute: (commandID) =>
              api.updateMembership(
                membership.orgID,
                membership.membershipID,
                {
                  expectedMembershipVersion: membership.membershipVersion,
                  orgRoles: membership.orgRoles,
                  assignments: plan.grants,
                },
                commandID,
              ),
          }),
          'membership',
        );
      } else {
        result = { kind: 'done', value: undefined };
        for (const assignment of plan.assignments) {
          result = outcome(
            await commands.run({
              key: orgKeys.revokeAssignment(assignment.assignmentID),
              label: 'снятия назначения',
              execute: (commandID) =>
                api.revokeAssignment(
                  membership.orgID,
                  membership.membershipID,
                  assignment.assignmentID,
                  assignment.assignmentVersion,
                  commandID,
                ),
            }),
            'membership',
          );
          if (result.kind !== 'done') break;
          committed = true;
        }
      }
      // A refusal may come from a membership that moved on: read it again.
      if (committed || result.kind === 'done' || result.kind === 'conflict') {
        membersChanged(membership.orgID);
      }
      return result.kind === 'done' ? { kind: 'saved' } : result;
    },
    async setAdmin(member, admin, editable) {
      const { membership } = member;
      const result = outcome(
        await commands.run({
          key: orgKeys.updateMembership(membership.membershipID),
          label: admin
            ? 'назначения администратора'
            : 'снятия роли администратора',
          execute: (commandID) =>
            api.updateMembership(
              membership.orgID,
              membership.membershipID,
              {
                expectedMembershipVersion: membership.membershipVersion,
                orgRoles: admin ? ['Admin'] : [],
                assignments: membership.assignments
                  .filter((assignment) => editable.has(assignment.restaurantID))
                  .map((assignment) => ({
                    restaurantID: assignment.restaurantID,
                    roles: assignment.roles,
                  })),
              },
              commandID,
            ),
        }),
        'membership',
      );
      if (result.kind === 'done' || result.kind === 'conflict') {
        membersChanged(membership.orgID);
      }
      return result;
    },
    async revokeMember(member) {
      const { membership } = member;
      const result = outcome(
        await commands.run({
          key: orgKeys.revokeMembership(membership.membershipID),
          label: 'отзыва доступа',
          execute: (commandID) =>
            api.revokeMembership(
              membership.orgID,
              membership.membershipID,
              membership.membershipVersion,
              commandID,
            ),
        }),
        'membership',
      );
      if (result.kind === 'done' || result.kind === 'conflict') {
        membersChanged(membership.orgID);
      }
      return result;
    },
    async invite(orgID, email, grants) {
      const result = outcome(
        await commands.run({
          key: orgKeys.invite(orgID),
          label: 'отправки приглашения',
          execute: (commandID) =>
            api.createInvitation(
              orgID,
              {
                email,
                assignments: grants.map((grant) => ({
                  restaurantID: grant.restaurantID,
                  roles: sortedRoles(grant.roles),
                })),
              },
              commandID,
            ),
        }),
        'invite',
      );
      if (result.kind === 'done') invitationsChanged(orgID);
      return result;
    },
    async resendLink(orgID, invitationID) {
      const result = outcome(
        await commands.run({
          key: orgKeys.resendLink(invitationID),
          label: 'повторной отправки ссылки',
          execute: (commandID) =>
            api.resendLink(orgID, invitationID, commandID),
        }),
        'invitation',
      );
      // A refusal (cooldown, expiry) changes what the list may offer.
      if (result.kind !== 'unknown') invitationsChanged(orgID);
      return result;
    },
    async cancelInvitation(orgID, invitationID) {
      const result = outcome(
        await commands.run({
          key: orgKeys.cancelInvitation(invitationID),
          label: 'отмены приглашения',
          execute: (commandID) =>
            api.cancelInvitation(orgID, invitationID, commandID),
        }),
        'invitation',
      );
      if (result.kind !== 'unknown') invitationsChanged(orgID);
      return result;
    },
    isPending,
    pendingOrganization: () =>
      isPending(orgKeys.createOrganization)
        ? unsettled.get(orgKeys.createOrganization)?.organization
        : undefined,
    pendingRestaurantName: (orgID) => {
      const key = orgKeys.addRestaurant(orgID);
      return isPending(key) ? unsettled.get(key)?.name : undefined;
    },
  };
}
