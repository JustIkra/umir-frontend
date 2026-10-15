import type {
  Assignment,
  AuthPageContext,
  DurableResult,
  Invitation,
  InvitationRow,
  Lifecycle,
  MailJob,
  Member,
  Membership,
  OrganizationProfile,
  Page,
  PeerReadiness,
  RoleGrant,
} from '@/application/organizations';
import {
  DecodeError,
  array,
  boolean,
  entityId,
  instant,
  nonEmptyString,
  object,
  oneOf,
  positiveInt64,
  string,
} from './common';

const staffRoles = ['Warehouse', 'Waiter'] as const;

// Unique values; the contract bounds the count of each list.
function distinct<T>(
  values: readonly T[],
  path: string,
  min: number,
  max: number,
): readonly T[] {
  if (
    values.length < min ||
    values.length > max ||
    new Set(values).size !== values.length
  ) {
    throw new DecodeError(
      path,
      `not ${String(min)} to ${String(max)} distinct`,
    );
  }
  return values;
}

// #Roles: one or two distinct staff roles.
function decodeRoles(value: unknown, path: string) {
  return distinct(
    array(value, path, (role, at) => oneOf(role, at, staffRoles)),
    path,
    1,
    2,
  );
}

function decodeAssignment(value: unknown, path: string): Assignment {
  const assignment = object(value, path);
  return {
    restaurantID: entityId(assignment.restaurantID, `${path}.restaurantID`),
    assignmentID: entityId(assignment.assignmentID, `${path}.assignmentID`),
    assignmentVersion: positiveInt64(
      assignment.assignmentVersion,
      `${path}.assignmentVersion`,
    ),
    roles: decodeRoles(assignment.roles, `${path}.roles`),
  };
}

export function decodeMembership(
  value: unknown,
  path = 'Membership',
): Membership {
  const membership = object(value, path);
  return {
    membershipID: entityId(membership.membershipID, `${path}.membershipID`),
    membershipVersion: positiveInt64(
      membership.membershipVersion,
      `${path}.membershipVersion`,
    ),
    userID: entityId(membership.userID, `${path}.userID`),
    orgID: entityId(membership.orgID, `${path}.orgID`),
    orgRoles: distinct(
      array(membership.orgRoles, `${path}.orgRoles`, (role, at) =>
        oneOf(role, at, ['Admin'] as const),
      ),
      `${path}.orgRoles`,
      0,
      1,
    ),
    assignments: array(
      membership.assignments,
      `${path}.assignments`,
      decodeAssignment,
    ),
    state: oneOf(membership.state, `${path}.state`, [
      'active',
      'revoked',
    ] as const),
  };
}

function decodeContext(value: unknown, path: string): AuthPageContext {
  const context = object(value, path);
  return {
    orgID: entityId(context.orgID, `${path}.orgID`),
    readerEpoch: entityId(context.readerEpoch, `${path}.readerEpoch`),
    aggregateRevision: positiveInt64(
      context.aggregateRevision,
      `${path}.aggregateRevision`,
    ),
    evaluatedAt: instant(context.evaluatedAt, `${path}.evaluatedAt`),
  };
}

// An absent cursor ends the list; an empty or oversize one is not the
// contract's.
function decodeCursor(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const cursor = nonEmptyString(value, path);
  if (cursor.length > 128) {
    throw new DecodeError(path, 'longer than 128');
  }
  return cursor;
}

function decodePage<T>(
  body: unknown,
  name: string,
  item: (value: unknown, path: string) => T,
): Page<T> {
  const page = object(body, name);
  return {
    context: decodeContext(page.context, `${name}.context`),
    items: array(page.items, `${name}.items`, item),
    nextCursor: decodeCursor(page.nextCursor, `${name}.nextCursor`),
  };
}

function decodeMember(value: unknown, path: string): Member {
  const contact = object(value, path);
  return {
    membership: decodeMembership(contact.membership, `${path}.membership`),
    displayName: string(contact.displayName, `${path}.displayName`),
    // A legacy account may have no verified address: required, nullable.
    email:
      contact.email === null
        ? undefined
        : nonEmptyString(contact.email, `${path}.email`),
  };
}

export function decodeMembersPage(body: unknown): Page<Member> {
  return decodePage(body, 'MembersPage', decodeMember);
}

function decodeGrant(value: unknown, path: string): RoleGrant {
  const grant = object(value, path);
  return {
    restaurantID: entityId(grant.restaurantID, `${path}.restaurantID`),
    roles: decodeRoles(grant.roles, `${path}.roles`),
  };
}

export function decodeInvitation(
  value: unknown,
  path = 'Invitation',
): Invitation {
  const invitation = object(value, path);
  return {
    invitationID: entityId(invitation.invitationID, `${path}.invitationID`),
    orgID: entityId(invitation.orgID, `${path}.orgID`),
    email: nonEmptyString(invitation.email, `${path}.email`),
    assignments: array(
      invitation.assignments,
      `${path}.assignments`,
      decodeGrant,
    ),
    expiresAt: instant(invitation.expiresAt, `${path}.expiresAt`),
    resendAvailableAt: instant(
      invitation.resendAvailableAt,
      `${path}.resendAvailableAt`,
    ),
    state: oneOf(invitation.state, `${path}.state`, [
      'pending',
      'accepted',
      'expired',
      'revoked',
      'suppressed',
    ] as const),
    version: positiveInt64(invitation.version, `${path}.version`),
  };
}

export function decodeMailJob(value: unknown, path = 'MailJob'): MailJob {
  const job = object(value, path);
  const attempts = job.attempts;
  if (
    typeof attempts !== 'number' ||
    !Number.isInteger(attempts) ||
    attempts < 0 ||
    attempts > 3
  ) {
    throw new DecodeError(`${path}.attempts`, 'not 0 to 3');
  }
  return {
    jobID: entityId(job.jobID, `${path}.jobID`),
    state: oneOf(job.state, `${path}.state`, [
      'pending',
      'sending',
      'sent',
      'retry',
      'unknown',
      'failed',
      'suppressed',
    ] as const),
    attempts,
    acceptedAt: instant(job.acceptedAt, `${path}.acceptedAt`),
    nextAttemptAt:
      job.nextAttemptAt === undefined
        ? undefined
        : instant(job.nextAttemptAt, `${path}.nextAttemptAt`),
  };
}

function decodeInvitationRow(value: unknown, path: string): InvitationRow {
  const row = object(value, path);
  return {
    invitation: decodeInvitation(row.invitation, `${path}.invitation`),
    linkDelivery:
      row.linkDelivery === null
        ? undefined
        : decodeMailJob(row.linkDelivery, `${path}.linkDelivery`),
    resendAllowed: boolean(row.resendAllowed, `${path}.resendAllowed`),
  };
}

export function decodeInvitationsPage(body: unknown): Page<InvitationRow> {
  return decodePage(body, 'InvitationsPage', decodeInvitationRow);
}

export function decodeDurableResult(body: unknown): DurableResult {
  const result = object(body, 'DurableResult');
  oneOf(result.outcome, 'DurableResult.outcome', ['committed'] as const);
  return {
    commandID: nonEmptyString(result.commandID, 'DurableResult.commandID'),
    aggregateRevision: positiveInt64(
      result.aggregateRevision,
      'DurableResult.aggregateRevision',
    ),
    resourceID: entityId(result.resourceID, 'DurableResult.resourceID'),
    mailJobs: array(result.mailJobs, 'DurableResult.mailJobs', decodeMailJob),
  };
}

function decodePeer(value: unknown, path: string): PeerReadiness {
  const peer = object(value, path);
  return {
    restaurantID: entityId(peer.restaurantID, `${path}.restaurantID`),
    service: oneOf(peer.service, `${path}.service`, [
      'warehouse',
      'serving',
      'gateway',
    ] as const),
    state: oneOf(peer.state, `${path}.state`, [
      'pending',
      'ready',
      'closed',
    ] as const),
  };
}

export function decodeLifecycle(body: unknown): Lifecycle {
  const result = object(body, 'LifecycleResult');
  return {
    operationID: entityId(result.operationID, 'LifecycleResult.operationID'),
    commandID: nonEmptyString(result.commandID, 'LifecycleResult.commandID'),
    orgID: entityId(result.orgID, 'LifecycleResult.orgID'),
    restaurantIDs: array(
      result.restaurantIDs,
      'LifecycleResult.restaurantIDs',
      (id, at) => entityId(id, at),
    ),
    lifecycle: oneOf(result.lifecycle, 'LifecycleResult.lifecycle', [
      'registering',
      'ready',
      'deleting',
      'deleted',
    ] as const),
    lifecycleVersion: positiveInt64(
      result.lifecycleVersion,
      'LifecycleResult.lifecycleVersion',
    ),
    cleanup: oneOf(result.cleanup, 'LifecycleResult.cleanup', [
      'not_required',
      'pending',
      'complete',
    ] as const),
    services: array(result.services, 'LifecycleResult.services', decodePeer),
  };
}

// #Organization: the answer to a saved time zone.
export function decodeOrganization(body: unknown): OrganizationProfile {
  const organization = object(body, 'Organization');
  const settings = object(organization.settings, 'Organization.settings');
  return {
    orgID: entityId(organization.orgID, 'Organization.orgID'),
    name: nonEmptyString(organization.name, 'Organization.name'),
    settings: {
      timeZone: nonEmptyString(
        settings.timeZone,
        'Organization.settings.timeZone',
      ),
      settingsVersion: positiveInt64(
        settings.settingsVersion,
        'Organization.settings.settingsVersion',
      ),
    },
    lifecycle: oneOf(organization.lifecycle, 'Organization.lifecycle', [
      'active',
      'deleting',
      'deleted',
    ] as const),
    lifecycleVersion: positiveInt64(
      organization.lifecycleVersion,
      'Organization.lifecycleVersion',
    ),
  };
}
