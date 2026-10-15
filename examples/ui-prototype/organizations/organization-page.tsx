import { chakra } from '@chakra-ui/react';
import { useRef } from 'react';
import { useLoaderData } from 'react-router';
import { type Organization } from '../placeholder-organizations';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { AddRestaurantDialog } from './add-restaurant-dialog';
import { zoneLine, zoneValue } from './format';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationTabs,
} from './organization-layout';
import { RestaurantList } from './restaurant-list';

// Figma OG02: the administrator's «Рестораны» tab with «Добавить ресторан».
function AdminRestaurants({ organization }: { organization: Organization }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader organization={organization} section="Рестораны" />
      }
    >
      <OrganizationTabs organization={organization} />
      <Button
        alignSelf="flex-start"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Добавить ресторан
      </Button>
      <Card>
        <RestaurantList restaurants={organization.restaurants} />
      </Card>
      <AddRestaurantDialog dialogRef={dialog} zone={organization.zone} />
    </OrganizationLayout>
  );
}

// Figma OG03: a staff member sees own restaurants and the zone, no tabs.
function StaffOrganization({ organization }: { organization: Organization }) {
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
          value={zoneValue(organization.zone)}
          note={`Часовой пояс организации: ${zoneLine(organization.zone)}. Изменить его может администратор организации.`}
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
  const organization = useLoaderData<Organization>();
  return organization.admin ? (
    <AdminRestaurants organization={organization} />
  ) : (
    <StaffOrganization organization={organization} />
  );
}
