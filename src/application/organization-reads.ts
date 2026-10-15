import { collectPages } from './organizations';
import type {
  InvitationList,
  MemberList,
  OrganizationProfile,
  OrganizationsApi,
} from './organizations';
import { createReadModel, type ReadModel } from './read-model';

// Read models of the Auth area, one set per organization. The lists are not
// pushed by the live stream (it belongs to a restaurant): they are read when
// opened, on «Обновить» and after the administrator's own commands.
export interface OrganizationReads {
  // Active members of one organization: every page of one Auth snapshot.
  members(orgID: string): ReadModel<MemberList>;
  // Invitations of every state.
  invitations(orgID: string): ReadModel<InvitationList>;
  // GET /api/v2/orgs/{orgID}: the name, the zone and its settingsVersion.
  profile(orgID: string): ReadModel<OrganizationProfile>;
  // Sign-out or another user: the next call creates new models.
  clear(): void;
}

export interface OrganizationReadsOptions {
  readonly api: Pick<
    OrganizationsApi,
    'members' | 'invitations' | 'organization'
  >;
  readonly now: () => number;
}

export function createOrganizationReads({
  api,
  now,
}: OrganizationReadsOptions): OrganizationReads {
  const members = new Map<string, ReadModel<MemberList>>();
  const invitations = new Map<string, ReadModel<InvitationList>>();
  const profiles = new Map<string, ReadModel<OrganizationProfile>>();
  const options = { refreshOnTick: false, now };

  function cached<T>(
    map: Map<string, ReadModel<T>>,
    orgID: string,
    load: Parameters<typeof createReadModel<T>>[0],
  ): ReadModel<T> {
    let model = map.get(orgID);
    if (model === undefined) {
      model = createReadModel(load, options);
      map.set(orgID, model);
    }
    return model;
  }

  return {
    members: (orgID) =>
      cached(members, orgID, ({ background }) =>
        collectPages((cursor) =>
          api.members(orgID, 'active', { cursor, background }),
        ),
      ),
    invitations: (orgID) =>
      cached(invitations, orgID, ({ background }) =>
        collectPages((cursor) =>
          api.invitations(orgID, 'all', { cursor, background }),
        ),
      ),
    profile: (orgID) =>
      cached(profiles, orgID, ({ background }) =>
        api.organization(orgID, { background }),
      ),
    clear() {
      members.clear();
      invitations.clear();
      profiles.clear();
    },
  };
}
