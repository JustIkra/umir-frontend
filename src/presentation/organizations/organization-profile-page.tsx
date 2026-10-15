import { chakra } from '@chakra-ui/react';
import { useLoaderData } from 'react-router';
import { administeredSample } from '@/presentation/placeholder-organizations';
import { Card } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { type OrganizationRoute } from './loaders';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';
import { TimezoneField } from './timezone-field';

// Figma TZ01: the name is read-only, the zone opens the TZ02 list. The zone
// field is the sample until the profile is read from Auth.
export function OrganizationProfilePage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <OrganizationLayout
          header={
            <OrganizationHeader
              organization={organization}
              section="Профиль организации"
            />
          }
        >
          <OrganizationTabs orgID={orgID} />
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
              initial={administeredSample.zone}
            />
          </Card>
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
