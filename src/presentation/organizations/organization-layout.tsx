import { Skeleton, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import {
  knownOrganizations,
  type AccessState,
  type OrganizationAccess,
} from '@/application/access';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { ServiceUnavailableAlert } from '@/presentation/ui/states';
import { TabNav } from '@/presentation/ui/tab-nav';
import { rem } from '@/presentation/ui/units';
import { organizationCaption, organizationPath } from './format';

// Figma organization frames: the header, then a 640px column; 16px gaps on
// 390, 24px from 1024.
export function OrganizationLayout({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      {header}
      <Stack gap={{ base: '4', sm: '6' }} w="full" maxW={rem(640)}>
        {children}
      </Stack>
    </Stack>
  );
}

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <ButtonLink variant="link" to={to} alignSelf="flex-start">
      {children}
    </ButtonLink>
  );
}

// OG06: the list of organizations is not known. It never means «no
// organizations».
export function OrganizationsUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <ServiceUnavailableAlert
      title="Список организаций не получен"
      onRetry={onRetry}
    >
      Сервис авторизации не отвечает. Это не означает, что организаций нет.
    </ServiceUnavailableAlert>
  );
}

export type OrganizationLookup =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly retry: () => void }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly organization: OrganizationAccess };

// The organization of the address from access. Access known without it (the
// right was revoked, the organization deleted here or in another tab) is
// `missing`: render must not throw, the page still mounted has to leave for
// the list. The loaders keep the 404 for an unknown address on first load.
export function lookupOrganization(
  state: AccessState,
  orgID: string,
  retry: () => void,
): OrganizationLookup {
  const known = knownOrganizations(state);
  if (known !== undefined) {
    const organization = known.find((item) => item.orgID === orgID);
    return organization === undefined
      ? { kind: 'missing' }
      : { kind: 'ready', organization };
  }
  if (state.status === 'loading') return { kind: 'loading' };
  return { kind: 'failed', retry };
}

export function useOrganization(orgID: string): OrganizationLookup {
  const { access } = useServices();
  const state = useAccess();
  return lookupOrganization(state, orgID, () => {
    void access.refresh();
  });
}

// «Все организации», the name and «Роль · рестораны · зона». The document
// title names the tab, so four tabs of one organization differ in history.
export function OrganizationHeader({
  organization,
  section,
}: {
  organization: OrganizationAccess;
  section?: string;
}) {
  const { now } = useServices();
  return (
    <Stack gap="1">
      <BackLink to="/app/organizations">Все организации</BackLink>
      <PageHeader
        title={organization.name}
        caption={organizationCaption(organization, now())}
        documentTitle={
          section ? `${section} · ${organization.name}` : organization.name
        }
      />
    </Stack>
  );
}

export function OrganizationTabs({ orgID }: { orgID: string }) {
  const path = organizationPath(orgID);
  return (
    <TabNav
      label="Разделы организации"
      tabs={[
        { to: path, title: 'Рестораны' },
        { to: `${path}/members`, title: 'Участники' },
        { to: `${path}/invitations`, title: 'Приглашения' },
        { to: `${path}/profile`, title: 'Профиль организации' },
      ]}
    />
  );
}

// OG05: placeholders of the cards while access is read.
export function CardSkeletons() {
  return (
    <Stack aria-hidden="true" gap={{ base: '4', sm: '6' }}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} h={rem(112)} borderRadius="md" />
      ))}
    </Stack>
  );
}

// An organization page body: a skeleton while access is read, OG06 when it
// was not (the organization is not known then), the page once it is known.
export function OrganizationState({
  orgID,
  children,
}: {
  orgID: string;
  children: (organization: OrganizationAccess) => ReactNode;
}) {
  const lookup = useOrganization(orgID);
  if (lookup.kind === 'ready') return children(lookup.organization);
  if (lookup.kind === 'missing') {
    return <Navigate to="/app/organizations" replace />;
  }
  return (
    <OrganizationLayout
      header={
        <Stack gap="1">
          <BackLink to="/app/organizations">Все организации</BackLink>
          <PageHeader title="Организация" />
        </Stack>
      }
    >
      {lookup.kind === 'loading' ? (
        <CardSkeletons />
      ) : (
        <OrganizationsUnavailable onRetry={lookup.retry} />
      )}
    </OrganizationLayout>
  );
}
