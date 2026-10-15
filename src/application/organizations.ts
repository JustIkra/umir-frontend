import { ApiError, localFailure, type Instant, type Settings } from './api';
import type {
  OrgLifecycle,
  RestaurantLifecycle,
  StaffRoleName,
} from './access';

// Organization administration of backend v2 (Auth): organizations,
// restaurants, members and invitations. Names follow the contract's schemas.

export interface Membership {
  readonly membershipID: string;
  readonly membershipVersion: string;
  readonly userID: string;
  readonly orgID: string;
  readonly orgRoles: readonly 'Admin'[];
  readonly assignments: readonly Assignment[];
  readonly state: 'active' | 'revoked';
}

export interface Assignment {
  readonly restaurantID: string;
  readonly assignmentID: string;
  readonly assignmentVersion: string;
  readonly roles: readonly StaffRoleName[];
}

// What an invitation or a membership update asks for in one restaurant.
export interface RoleGrant {
  readonly restaurantID: string;
  readonly roles: readonly StaffRoleName[];
}

// #MemberContact: the membership with the name and the verified address. A
// legacy account may have no address (email undefined).
export interface Member {
  readonly membership: Membership;
  readonly displayName: string;
  readonly email: string | undefined;
}

// The identity of one Auth snapshot: every page of a list repeats it.
export interface AuthPageContext {
  readonly orgID: string;
  readonly readerEpoch: string;
  readonly aggregateRevision: string;
  readonly evaluatedAt: Instant;
}

export interface Page<T> {
  readonly context: AuthPageContext;
  readonly items: readonly T[];
  readonly nextCursor: string | undefined;
}

export interface MemberList {
  readonly context: AuthPageContext;
  readonly items: readonly Member[];
}

export type InvitationState =
  'pending' | 'accepted' | 'expired' | 'revoked' | 'suppressed';

export interface Invitation {
  readonly invitationID: string;
  readonly orgID: string;
  readonly email: string;
  readonly assignments: readonly RoleGrant[];
  readonly expiresAt: Instant;
  readonly resendAvailableAt: Instant;
  readonly state: InvitationState;
  readonly version: string;
}

export type MailJobState =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'retry'
  | 'unknown'
  | 'failed'
  | 'suppressed';

export interface MailJob {
  readonly jobID: string;
  readonly state: MailJobState;
  readonly attempts: number;
  readonly acceptedAt: Instant;
  readonly nextAttemptAt: Instant | undefined;
}

// #InvitationListRow: linkDelivery is the latest link job, undefined for an
// invitation made before link mail existed.
export interface InvitationRow {
  readonly invitation: Invitation;
  readonly linkDelivery: MailJob | undefined;
  readonly resendAllowed: boolean;
}

export interface InvitationList {
  readonly context: AuthPageContext;
  readonly items: readonly InvitationRow[];
}

export interface DurableResult {
  readonly commandID: string;
  readonly aggregateRevision: string;
  readonly resourceID: string;
  readonly mailJobs: readonly MailJob[];
}

export type PeerService = 'warehouse' | 'serving' | 'gateway';
export type PeerState = 'pending' | 'ready' | 'closed';

export interface PeerReadiness {
  readonly restaurantID: string;
  readonly service: PeerService;
  readonly state: PeerState;
}

// #LifecycleResult: the answer to a creation or a deletion and the state of
// its polling. operationID, not commandID, names the operation.
export interface Lifecycle {
  readonly operationID: string;
  readonly commandID: string;
  readonly orgID: string;
  readonly restaurantIDs: readonly string[];
  readonly lifecycle: RestaurantLifecycle;
  readonly lifecycleVersion: string;
  readonly cleanup: 'not_required' | 'pending' | 'complete';
  readonly services: readonly PeerReadiness[];
}

export interface OrganizationProfile {
  readonly orgID: string;
  readonly name: string;
  readonly settings: Settings;
  readonly lifecycle: OrgLifecycle;
  readonly lifecycleVersion: string;
}

export interface NewOrganization {
  readonly name: string;
  readonly timeZone: string;
  readonly firstRestaurantName: string;
}

export interface MembershipUpdate {
  readonly expectedMembershipVersion: string;
  readonly orgRoles: readonly 'Admin'[];
  readonly assignments: readonly RoleGrant[];
}

export type MemberFilter = 'active' | 'revoked' | 'all';
export type InvitationFilter = InvitationState | 'all';

export interface PageQuery {
  readonly cursor: string | undefined;
  readonly background: boolean;
}

// Each call rejects with ApiError. The reads page by an opaque cursor; the
// commands carry the client's commandID and are repeated with it.
export interface OrganizationsApi {
  members(
    orgID: string,
    state: MemberFilter,
    query: PageQuery,
  ): Promise<Page<Member>>;
  invitations(
    orgID: string,
    state: InvitationFilter,
    query: PageQuery,
  ): Promise<Page<InvitationRow>>;
  // GET /api/v2/orgs/{orgID}: the name, the zone and its settingsVersion.
  organization(
    orgID: string,
    query: { readonly background: boolean },
  ): Promise<OrganizationProfile>;
  createOrganization(
    input: NewOrganization,
    commandID: string,
  ): Promise<Lifecycle>;
  createRestaurant(
    orgID: string,
    name: string,
    commandID: string,
  ): Promise<Lifecycle>;
  deleteRestaurant(
    orgID: string,
    restaurantID: string,
    commandID: string,
  ): Promise<Lifecycle>;
  deleteOrganization(orgID: string, commandID: string): Promise<Lifecycle>;
  lifecycle(orgID: string, operationID: string): Promise<Lifecycle>;
  updateSettings(
    orgID: string,
    input: { readonly timeZone: string; readonly expectedVersion: string },
    commandID: string,
  ): Promise<OrganizationProfile>;
  updateMembership(
    orgID: string,
    membershipID: string,
    input: MembershipUpdate,
    commandID: string,
  ): Promise<Membership>;
  revokeMembership(
    orgID: string,
    membershipID: string,
    expectedVersion: string,
    commandID: string,
  ): Promise<DurableResult>;
  revokeAssignment(
    orgID: string,
    membershipID: string,
    assignmentID: string,
    expectedVersion: string,
    commandID: string,
  ): Promise<DurableResult>;
  createInvitation(
    orgID: string,
    input: {
      readonly email: string;
      readonly assignments: readonly RoleGrant[];
    },
    commandID: string,
  ): Promise<Invitation>;
  resendLink(
    orgID: string,
    invitationID: string,
    commandID: string,
  ): Promise<DurableResult>;
  cancelInvitation(
    orgID: string,
    invitationID: string,
    commandID: string,
  ): Promise<DurableResult>;
}

// A list is read to its end. 200 rows per page and 20 pages bound it far
// beyond an organization of 100 restaurants.
const pageLimit = 20;
const restartLimit = 2;

function malformed(): ApiError {
  return new ApiError(localFailure('Malformed', 'unavailable', 200));
}

// Reads every page of one snapshot. A cursor Auth no longer holds (409
// RefreshRequired), another reader epoch or another revision between pages
// starts the read over, at most twice; a list that does not end fails as
// malformed instead of showing a part of it.
export async function collectPages<T>(
  read: (cursor: string | undefined) => Promise<Page<T>>,
): Promise<{
  readonly context: AuthPageContext;
  readonly items: readonly T[];
}> {
  for (let restart = 0; restart <= restartLimit; restart += 1) {
    const items: T[] = [];
    let first: AuthPageContext | undefined;
    let cursor: string | undefined;
    let again = false;
    for (let count = 0; count < pageLimit; count += 1) {
      let page: Page<T>;
      try {
        page = await read(cursor);
      } catch (error) {
        const refresh =
          error instanceof ApiError &&
          error.failure.code === 'RefreshRequired' &&
          cursor !== undefined;
        if (!refresh) throw error;
        again = true;
        break;
      }
      first ??= page.context;
      if (
        page.context.orgID !== first.orgID ||
        page.context.readerEpoch !== first.readerEpoch ||
        page.context.aggregateRevision !== first.aggregateRevision
      ) {
        again = true;
        break;
      }
      items.push(...page.items);
      if (page.nextCursor === undefined) return { context: first, items };
      cursor = page.nextCursor;
    }
    if (!again) throw malformed();
  }
  throw new ApiError(localFailure('RefreshRequired', 'unavailable', 409));
}
