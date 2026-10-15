import { chakra } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import { useServices } from '@/presentation/services';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { AddRestaurantDialog } from './add-restaurant-dialog';
import { restaurantDeletingTitle } from './deletion';
import { zoneLabel } from '@/presentation/ui/zones';
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
  // RS05: the restaurant that was just added; its row comes with the access
  // read that the command asks for.
  const [added, setAdded] = useState<string>();
  // The restaurant whose deletion was just accepted; its row goes with the
  // access read that the command asks for.
  const [deleted, setDeleted] = useState<string>();
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
        onClick={() => {
          setAdded(undefined);
          setDeleted(undefined);
          dialog.current?.showModal();
        }}
      >
        Добавить ресторан
      </Button>
      {added !== undefined && (
        <FormMessage
          tone="success"
          title={`Ресторан «${added}» добавлен. Настройка обычно занимает до минуты.`}
        />
      )}
      {deleted !== undefined && (
        <FormMessage tone="success" title={restaurantDeletingTitle(deleted)} />
      )}
      <Card>
        <RestaurantList
          restaurants={organization.restaurants}
          admin
          onDeleted={(name) => {
            setAdded(undefined);
            setDeleted(name);
          }}
        />
      </Card>
      <AddRestaurantDialog
        dialogRef={dialog}
        orgID={organization.orgID}
        timeZone={organization.settings.timeZone}
        onAdded={(name) => {
          setDeleted(undefined);
          setAdded(name);
        }}
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
          value={zoneLabel(timeZone, now())}
          note="Изменить его может только администратор организации."
        />
      </Card>
      <ButtonLink
        variant="secondary"
        to="/app/organizations/new"
        alignSelf="flex-start"
      >
        Создать организацию
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
