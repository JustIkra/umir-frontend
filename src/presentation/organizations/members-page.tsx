import { Box, Flex } from '@chakra-ui/react';
import { useLoaderData } from 'react-router';
import { administeredSample } from '@/presentation/placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { organizationPath } from './format';
import { type OrganizationRoute } from './loaders';
import { MemberList } from './member-list';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';

// Figma MB01. The search field is for show: it does not filter yet. The list
// is the sample until the members are read from Auth.
export function MembersPage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  const path = organizationPath(orgID);
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <OrganizationLayout
          header={
            <OrganizationHeader
              organization={organization}
              section="Участники"
            />
          }
        >
          <OrganizationTabs orgID={orgID} />
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'center' }}
            gap="3"
          >
            <Box flex="1">
              <SearchInput label="Найти по имени или почте" />
            </Box>
            <ButtonLink to={`${path}/invitations/new`}>
              Пригласить участника
            </ButtonLink>
          </Flex>
          <MemberList
            members={administeredSample.members}
            basePath={`${path}/members`}
          />
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
