import { Box, Flex, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useLoaderData, useLocation } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import { type MemberList as MemberListModel } from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { useReadModel, useSession } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { SearchInput } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { ServiceUnavailableAlert } from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import { organizationPath } from './format';
import { type OrganizationRoute } from './loaders';
import { MemberList } from './member-list';
import { filterMembers, revokedName, revokedNotice } from './members';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';
import { RefreshButton, useRefreshOnOpen } from './refresh';

// MB05.
function MemberSkeleton() {
  return (
    <Stack aria-hidden="true" gap="2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} h={rem(88)} borderRadius="md" />
      ))}
    </Stack>
  );
}

// MB04: nobody but the administrator.
function NoOtherMembers({ invitePath }: { invitePath: string }) {
  return (
    <Card as="section">
      <chakra.h2 textStyle="heading.h3">Других участников нет</chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        Пригласите сотрудников по почте и назначьте им рестораны и роли.
      </Text>
      <ButtonLink
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        to={invitePath}
      >
        Пригласить участника
      </ButtonLink>
    </Card>
  );
}

function MembersLoaded({
  organization,
  list,
}: {
  organization: OrganizationAccess;
  list: MemberListModel;
}) {
  const session = useSession();
  const [query, setQuery] = useState('');
  const path = organizationPath(organization.orgID);
  const invitePath = `${path}/invitations/new`;
  const currentUserID =
    session.status === 'active' ? session.user.userID : undefined;
  const found = filterMembers(list.items, query);
  if (
    list.items.every((member) => member.membership.userID === currentUserID)
  ) {
    return <NoOtherMembers invitePath={invitePath} />;
  }
  return (
    <>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'stretch', sm: 'center' }}
        gap="3"
      >
        <Box flex="1">
          <SearchInput
            label="Найти по имени или почте"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
        </Box>
        <ButtonLink to={invitePath}>Пригласить участника</ButtonLink>
      </Flex>
      {found.length === 0 ? (
        <Text role="status" textStyle="body.default" color="text.secondary">
          Ничего не найдено. Проверьте имя или почту.
        </Text>
      ) : (
        <MemberList
          members={found}
          restaurants={organization.restaurants}
          basePath={`${path}/members`}
          currentUserID={currentUserID}
        />
      )}
    </>
  );
}

function MembersBody({ organization }: { organization: OrganizationAccess }) {
  const { organizations } = useServices();
  const model = organizations.reads.members(organization.orgID);
  const snapshot = useReadModel(model);
  useRefreshOnOpen(model);
  const revoked = revokedName(useLocation().state);
  const notice = revoked === undefined ? undefined : revokedNotice(revoked);
  return (
    <>
      {notice && (
        <FormMessage tone="success" title={notice.title}>
          {notice.text}
        </FormMessage>
      )}
      {snapshot.value !== undefined ? (
        <>
          <RefreshButton model={model} loading={snapshot.loading} />
          <MembersLoaded organization={organization} list={snapshot.value} />
        </>
      ) : snapshot.failed ? (
        <ServiceUnavailableAlert
          title="Список участников не получен"
          onRetry={() => {
            model.refresh();
          }}
        >
          Сервис авторизации не отвечает. Это не означает, что участников нет.
        </ServiceUnavailableAlert>
      ) : (
        <MemberSkeleton />
      )}
    </>
  );
}

// Figma MB01 to MB06: the members of Auth, the search is on the client.
export function MembersPage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
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
          <MembersBody organization={organization} />
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
