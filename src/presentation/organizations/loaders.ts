import { type LoaderFunctionArgs } from 'react-router';
import { knownOrganizations } from '@/application/access';
import { isEntityId } from '@/domain/ids';
import { NotFound } from '@/presentation/documents/not-found-page';
import { type PresentationServices } from '@/presentation/services';

export interface OrganizationRoute {
  readonly orgID: string;
}

export interface MemberRoute extends OrganizationRoute {
  readonly membershipID: string;
}

// The organization of the address is checked against /access. A malformed id
// is a 404 at once. With access known, an organization outside it (or, for
// administrator pages, one the user does not administer) is a 404. Without
// any answer the page shows OG06 instead: a lost check never means «no such
// organization».
async function checkOrganization(
  services: PresentationServices,
  orgID: string | undefined,
  adminOnly: boolean,
): Promise<string> {
  if (!isEntityId(orgID)) throw new NotFound();
  if ((await services.session.ensure()).status === 'active') {
    await services.access.ensure();
  }
  const known = knownOrganizations(services.access.getSnapshot());
  if (known !== undefined) {
    const organization = known.find((item) => item.orgID === orgID);
    if (organization === undefined || (adminOnly && !organization.admin)) {
      throw new NotFound();
    }
  }
  return orgID;
}

// Any member of the organization.
export function createOrganizationLoader(services: PresentationServices) {
  return async ({
    params,
  }: LoaderFunctionArgs): Promise<OrganizationRoute> => ({
    orgID: await checkOrganization(services, params.org, false),
  });
}

// Members, invitations and the profile are for the administrator.
export function createAdminLoader(services: PresentationServices) {
  return async ({
    params,
  }: LoaderFunctionArgs): Promise<OrganizationRoute> => ({
    orgID: await checkOrganization(services, params.org, true),
  });
}

// A member card: the administrator and a valid :member.
export function createMemberLoader(services: PresentationServices) {
  return async ({ params }: LoaderFunctionArgs): Promise<MemberRoute> => {
    const orgID = await checkOrganization(services, params.org, true);
    if (!isEntityId(params.member)) throw new NotFound();
    return { orgID, membershipID: params.member };
  };
}
