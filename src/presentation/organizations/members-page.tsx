import { Box, Flex } from '@chakra-ui/react';
import { useLoaderData } from 'react-router';
import { type Organization } from '@/presentation/placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { rem } from '@/presentation/ui/units';
import { organizationPath } from './format';
import { MemberList } from './member-list';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationTabs,
} from './organization-layout';

// Figma MB01. The search field is for show: it does not filter yet.
export function MembersPage() {
  const organization = useLoaderData<Organization>();
  const path = organizationPath(organization);
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader organization={organization} section="Участники" />
      }
    >
      <OrganizationTabs organization={organization} />
      <Flex gap="3" wrap="wrap" align="center">
        <Box flex="1" minW={rem(240)}>
          <SearchInput label="Найти по имени или почте" />
        </Box>
        <ButtonLink to={`${path}/invitations/new`}>
          Пригласить участника
        </ButtonLink>
      </Flex>
      <MemberList members={organization.members} basePath={`${path}/members`} />
    </OrganizationLayout>
  );
}
