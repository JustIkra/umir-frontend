import { Stack, Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { organizations, type Organization } from '../placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { organizationPath, zoneLine } from './format';
import { OrganizationLayout } from './organization-layout';

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
function OrganizationCard({ organization }: { organization: Organization }) {
  return (
    <CardLink to={organizationPath(organization)}>
      <chakra.h2 textStyle="heading.h3">{organization.name}</chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        {organization.role}
      </Text>
      <Text textStyle="caption.default" color="text.secondary">
        {organization.count}
      </Text>
      <Text textStyle="caption.default" color="text.secondary">
        {zoneLine(organization.zone)}
      </Text>
    </CardLink>
  );
}

// Figma OG01 «Организации и рестораны».
export function OrganizationsPage() {
  return (
    <OrganizationLayout
      header={
        <PageHeader
          title="Организации и рестораны"
          caption="Организации, в которых у вас есть доступ, и ваши роли"
        />
      }
    >
      <ButtonLink
        variant="secondary"
        to="/app/organizations/new"
        alignSelf="flex-start"
      >
        Создать предприятие
      </ButtonLink>
      <Stack as="ul" gap={{ base: '4', sm: '6' }} listStyleType="none">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <OrganizationCard organization={organization} />
          </li>
        ))}
      </Stack>
    </OrganizationLayout>
  );
}
