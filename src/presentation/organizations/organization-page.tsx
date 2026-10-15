import { chakra } from '@chakra-ui/react';
import { useRef } from 'react';
import { useLoaderData } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import { useServices } from '@/presentation/services';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { AddRestaurantDialog } from './add-restaurant-dialog';
import { zoneLine, zoneValue } from './format';
import { type OrganizationRoute } from './loaders';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';
import { RestaurantList } from './restaurant-list';

// Figma OG02: the administrator's «Рестораны» tab with «Добавить ресторан».
function AdminRestaurants({
  organization,
}: {
  organization: OrganizationAccess;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader organization={organization} section="Рестораны" />
      }
    >
      <OrganizationTabs orgID={organization.orgID} />
      <Button
        alignSelf="flex-start"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Добавить ресторан
      </Button>
      <Card>
        <RestaurantList restaurants={organization.restaurants} admin />
      </Card>
      <AddRestaurantDialog
        dialogRef={dialog}
        timeZone={organization.settings.timeZone}
      />
    </OrganizationLayout>
  );
}

// Figma OG03: a staff member sees own restaurants and the zone, no tabs.
function StaffOrganization({
  organization,
}: {
  organization: OrganizationAccess;
}) {
  const { now } = useServices();
  const { timeZone } = organization.settings;
  return (
    <OrganizationLayout
      header={<OrganizationHeader organization={organization} />}
    >
      <Card as="section">
        <chakra.h2 textStyle="heading.h3">Ваши рестораны и роли</chakra.h2>
        <RestaurantList restaurants={organization.restaurants} />
      </Card>
      <Card>
        <ReadOnlyValue
          label="Часовой пояс организации"
          value={zoneValue(timeZone, now())}
          note={`Часовой пояс организации: ${zoneLine(timeZone, now())}. Изменить его может администратор организации.`}
          mono={false}
        />
      </Card>
      <ButtonLink
        variant="secondary"
        to="/app/organizations/new"
        alignSelf="flex-start"
      >
        Создать предприятие
      </ButtonLink>
    </OrganizationLayout>
  );
}

export function OrganizationPage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) =>
        organization.admin ? (
          <AdminRestaurants organization={organization} />
        ) : (
          <StaffOrganization organization={organization} />
        )
      }
    </OrganizationState>
  );
}
