import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { OrganizationsApi } from '@/application/organizations';
import type { components } from './backend-v2';
import {
  decodeDurableResult,
  decodeInvitation,
  decodeInvitationsPage,
  decodeLifecycle,
  decodeMembersPage,
  decodeMembership,
  decodeOrganization,
} from './decode/organizations';
import { decoded } from './decode/common';

const orgsPath = '/api/v2/orgs';
const part = encodeURIComponent;
const orgPath = (orgID: string) => `${orgsPath}/${part(orgID)}`;

const readMembers = decoded(decodeMembersPage, 'unavailable');
const readInvitations = decoded(decodeInvitationsPage, 'unavailable');
const readOrganization = decoded(decodeOrganization, 'unavailable');
const readLifecycle = decoded(decodeLifecycle, 'unavailable');
// A command's answer that is not the contract's leaves its outcome unknown.
const lifecycleOf = decoded(decodeLifecycle, 'unknown');
const durableOf = decoded(decodeDurableResult, 'unknown');
const membershipOf = decoded((body) => decodeMembership(body), 'unknown');
const invitationOf = decoded((body) => decodeInvitation(body), 'unknown');
const organizationOf = decoded(decodeOrganization, 'unknown');

function query(state: string, cursor: string | undefined): string {
  const parameters = new URLSearchParams({ state });
  if (cursor !== undefined) parameters.set('cursor', cursor);
  parameters.set('limit', '200');
  return `?${parameters.toString()}`;
}

// The organization administration of gateway. The lists are Admin-only reads
// in pages of 200 rows; commands carry commandID in the body.
export function createOrganizationsApi(
  client: Pick<GatewayClient, 'read' | 'send'>,
): OrganizationsApi {
  return {
    async members(orgID, state, { cursor, background }) {
      return readMembers(
        await client.read(`${orgPath(orgID)}/members${query(state, cursor)}`, {
          background,
        }),
      );
    },
    async invitations(orgID, state, { cursor, background }) {
      return readInvitations(
        await client.read(
          `${orgPath(orgID)}/invitations${query(state, cursor)}`,
          { background },
        ),
      );
    },
    async organization(orgID, { background }) {
      return readOrganization(
        await client.read(orgPath(orgID), { background }),
      );
    },
    async createOrganization(input, commandID) {
      const body: components['schemas']['CreateOrganization'] = {
        commandID,
        name: input.name,
        timeZone: input.timeZone,
        firstRestaurantName: input.firstRestaurantName,
      };
      return lifecycleOf(await client.send('POST', orgsPath, { body }));
    },
    async createRestaurant(orgID, name, commandID) {
      const body: components['schemas']['CreateRestaurant'] = {
        commandID,
        name,
      };
      return lifecycleOf(
        await client.send('POST', `${orgPath(orgID)}/restaurants`, { body }),
      );
    },
    async deleteRestaurant(orgID, restaurantID, commandID) {
      const body: components['schemas']['Command'] = { commandID };
      return lifecycleOf(
        await client.send(
          'DELETE',
          `${orgPath(orgID)}/restaurants/${part(restaurantID)}`,
          { body },
        ),
      );
    },
    async deleteOrganization(orgID, commandID) {
      const body: components['schemas']['Command'] = { commandID };
      return lifecycleOf(await client.send('DELETE', orgPath(orgID), { body }));
    },
    async lifecycle(orgID, operationID) {
      return readLifecycle(
        await client.read(`${orgPath(orgID)}/lifecycle/${part(operationID)}`, {
          background: true,
        }),
      );
    },
    async updateSettings(orgID, { timeZone, expectedVersion }, commandID) {
      const body: components['schemas']['UpdateSettings'] = {
        commandID,
        expectedSettingsVersion: expectedVersion,
        timeZone,
      };
      return organizationOf(
        await client.send('PATCH', `${orgPath(orgID)}/settings`, { body }),
      );
    },
    async updateMembership(orgID, membershipID, input, commandID) {
      const body: components['schemas']['UpdateMembership'] = {
        commandID,
        expectedMembershipVersion: input.expectedMembershipVersion,
        orgRoles: [...input.orgRoles],
        assignments: input.assignments.map((grant) => ({
          restaurantID: grant.restaurantID,
          roles: [...grant.roles],
        })),
      };
      return membershipOf(
        await client.send(
          'PUT',
          `${orgPath(orgID)}/memberships/${part(membershipID)}`,
          { body },
        ),
      );
    },
    async revokeMembership(orgID, membershipID, expectedVersion, commandID) {
      const body: components['schemas']['RevokeMembership'] = {
        commandID,
        expectedMembershipVersion: expectedVersion,
      };
      return durableOf(
        await client.send(
          'DELETE',
          `${orgPath(orgID)}/memberships/${part(membershipID)}`,
          { body },
        ),
      );
    },
    async revokeAssignment(
      orgID,
      membershipID,
      assignmentID,
      expectedVersion,
      commandID,
    ) {
      const body: components['schemas']['RevokeAssignment'] = {
        commandID,
        expectedAssignmentVersion: expectedVersion,
      };
      return durableOf(
        await client.send(
          'DELETE',
          `${orgPath(orgID)}/memberships/${part(membershipID)}/assignments/${part(assignmentID)}`,
          { body },
        ),
      );
    },
    async createInvitation(orgID, { email, assignments }, commandID) {
      const body: components['schemas']['CreateInvitation'] = {
        commandID,
        email,
        assignments: assignments.map((grant) => ({
          restaurantID: grant.restaurantID,
          roles: [...grant.roles],
        })),
      };
      return invitationOf(
        await client.send('POST', `${orgPath(orgID)}/invitations`, { body }),
      );
    },
    async resendLink(orgID, invitationID, commandID) {
      const body: components['schemas']['Command'] = { commandID };
      return durableOf(
        await client.send(
          'POST',
          `${orgPath(orgID)}/invitations/${part(invitationID)}/resend-link`,
          { body },
        ),
      );
    },
    async cancelInvitation(orgID, invitationID, commandID) {
      const body: components['schemas']['Command'] = { commandID };
      return durableOf(
        await client.send(
          'DELETE',
          `${orgPath(orgID)}/invitations/${part(invitationID)}`,
          { body },
        ),
      );
    },
  };
}
