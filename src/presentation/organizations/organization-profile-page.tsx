import { chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useLoaderData } from 'react-router';
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

// The choice is kept on the screen only until the profile is saved to Auth.
function ZoneSection({ timeZone }: { timeZone: string }) {
  const [zone, setZone] = useState(timeZone);
  return (
    <Card as="section">
      <chakra.h2 textStyle="heading.h3">Часовой пояс</chakra.h2>
      <TimezoneField
        id="organization-zone"
        hint="Действует для всех ресторанов организации."
        value={zone}
        onChange={setZone}
      />
    </Card>
  );
}

// Figma TZ01: the name is read-only, the zone opens the TZ02 list. Saving the
// zone is not connected to Auth yet.
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
          <ZoneSection timeZone={organization.settings.timeZone} />
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
