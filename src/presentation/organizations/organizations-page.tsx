import { Stack, Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import {
  knownOrganizations,
  type OrganizationAccess,
} from '@/application/access';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useServices } from '@/presentation/services';
import { useAccess, useStore } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { InfoNotice } from '@/presentation/ui/states';
import { organizationDeletionNotice } from './deletion';
import { zoneLabel } from '@/presentation/ui/zones';
import { organizationPath, restaurantCount } from './format';
import {
  CardSkeletons,
  OrganizationLayout,
  OrganizationsUnavailable,
} from './organization-layout';

const CardLink = chakra(RouterLink, {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2',
    p: '6',
    bg: 'bg.surface',
    borderWidth: '1px',
    borderColor: 'border.default',
    borderRadius: 'md',
    color: 'text.primary',
    _hover: { borderColor: 'border.strong' },
  },
});

// Figma Organization card: the whole card opens the organization.
function OrganizationCard({
  organization,
}: {
  organization: OrganizationAccess;
}) {
  const { now } = useServices();
  return (
    <CardLink to={organizationPath(organization.orgID)}>
      <chakra.h2 textStyle="heading.h3">{organization.name}</chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        {organization.admin ? 'Администратор' : 'Сотрудник'}
      </Text>
      <Text textStyle="caption.default" color="text.secondary">
        {restaurantCount(organization.restaurants.length)}
      </Text>
      {organization.admin && (
        <Text textStyle="caption.default" color="text.secondary">
          {zoneLabel(organization.settings.timeZone, now())}
        </Text>
      )}
    </CardLink>
  );
}

// Figma OG04: the account is in no organization.
function NoOrganizations() {
  return (
    <Card as="section">
      <chakra.h2 textStyle="heading.h3">Нет организаций</chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        Учётная запись пока не входит ни в одну организацию. Доступ
        предоставляет администратор организации по приглашению на почту. Также
        можно создать собственное предприятие.
      </Text>
      <ButtonLink to="/app/organizations/new" alignSelf="flex-start">
        Создать предприятие
      </ButtonLink>
    </Card>
  );
}

// Figma OG01 «Организации и рестораны» from GET /access, with OG04 (none),
// OG05 (reading) and OG06 (not received). An earlier answer stays shown while
// a new check fails.
export function OrganizationsPage() {
  const { access, organizations: services } = useServices();
  const state = useAccess();
  const notices = useStore(services.lifecycles).flatMap((operation) => {
    const notice = organizationDeletionNotice(operation);
    return notice === undefined ? [] : [{ operation, notice }];
  });
  const organizations = knownOrganizations(state);
  let body;
  if (organizations === undefined) {
    body =
      state.status === 'loading' ? (
        <CardSkeletons />
      ) : (
        <OrganizationsUnavailable
          onRetry={() => {
            void access.refresh();
          }}
        />
      );
  } else if (organizations.length === 0) {
    body = <NoOrganizations />;
  } else {
    body = (
      <>
        <ButtonLink
          variant="secondary"
          to="/app/organizations/new"
          alignSelf="flex-start"
        >
          Создать предприятие
        </ButtonLink>
        <Stack as="ul" gap={{ base: '4', sm: '6' }} listStyleType="none">
          {organizations.map((organization) => (
            <li key={organization.orgID}>
              <OrganizationCard organization={organization} />
            </li>
          ))}
        </Stack>
      </>
    );
  }
  return (
    <OrganizationLayout
      header={
        <PageHeader
          title="Организации и рестораны"
          caption="Организации, в которых у вас есть доступ, и ваши роли"
        />
      }
    >
      {notices.map(({ operation, notice }) => (
        <InfoNotice key={operation.operationID} title={notice.title}>
          {notice.text}
        </InfoNotice>
      ))}
      {body}
    </OrganizationLayout>
  );
}
