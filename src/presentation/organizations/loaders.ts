import { type LoaderFunctionArgs } from 'react-router';
import { NotFound } from '@/presentation/documents/not-found-page';
import {
  findOrganization,
  type Member,
  type Organization,
} from '@/presentation/placeholder-organizations';

// Route params pick sample records; anything else is a 404.
export function organizationLoader({ params }: LoaderFunctionArgs) {
  const organization = findOrganization(params.org);
  if (!organization) throw new NotFound();
  return organization;
}

// Members, invitations and the profile are for the organization administrator.
export function adminOrganizationLoader(args: LoaderFunctionArgs) {
  const organization = organizationLoader(args);
  if (!organization.admin) throw new NotFound();
  return organization;
}

export interface MemberData {
  readonly organization: Organization;
  readonly member: Member;
}

// The administrator has no «Участник» page: their access is not edited.
export function memberLoader(args: LoaderFunctionArgs): MemberData {
  const organization = adminOrganizationLoader(args);
  const member = organization.members.find(
    (candidate) => candidate.id === args.params.member && !candidate.admin,
  );
  if (!member) throw new NotFound();
  return { organization, member };
}
