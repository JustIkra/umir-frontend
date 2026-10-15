import { Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { type Organization } from '../placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { TabNav } from '@/presentation/ui/tab-nav';
import { rem } from '@/presentation/ui/units';
import { organizationPath, zoneLine } from './format';

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

// «Все организации», the name and «Роль · рестораны · зона». The document
// title names the tab, so four tabs of one organization differ in history.
export function OrganizationHeader({
  organization,
  section,
}: {
  organization: Organization;
  section?: string;
}) {
  const caption = organization.admin
    ? `${organization.role} · ${organization.count} · ${zoneLine(organization.zone)}`
    : `Сотрудник · ${organization.count}`;
  return (
    <Stack gap="1">
      <BackLink to="/app/organizations">Все организации</BackLink>
      <PageHeader
        title={organization.name}
        caption={caption}
        documentTitle={
          section ? `${section} · ${organization.name}` : organization.name
        }
      />
    </Stack>
  );
}

export function OrganizationTabs({
  organization,
}: {
  organization: Organization;
}) {
  const path = organizationPath(organization);
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
