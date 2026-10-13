import { chakra } from '@chakra-ui/react';
import { useLoaderData } from 'react-router';
import { type Organization } from '@/presentation/placeholder-organizations';
import { Card } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationTabs,
} from './organization-layout';
import { TimezoneField } from './timezone-field';

// Figma TZ01: the name is read-only, the zone opens the TZ02 list.
export function OrganizationProfilePage() {
  const organization = useLoaderData<Organization>();
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader
          organization={organization}
          section="Профиль организации"
        />
      }
    >
      <OrganizationTabs organization={organization} />
      <Card>
        <ReadOnlyValue
          label="Название организации"
          value={organization.name}
          note="Название задаётся при создании организации."
        />
      </Card>
      <Card as="section">
        <chakra.h2 textStyle="heading.h3">Часовой пояс</chakra.h2>
        <TimezoneField
          id="organization-zone"
          hint="Действует для всех ресторанов организации."
          initial={organization.zone}
        />
      </Card>
    </OrganizationLayout>
  );
}
