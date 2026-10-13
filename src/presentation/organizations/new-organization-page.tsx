import { Flex } from '@chakra-ui/react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { zones } from '@/presentation/placeholder-organizations';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { CardForm } from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { OrganizationLayout } from './organization-layout';
import { TimezoneField } from './timezone-field';

// Figma NE01. «Создать предприятие» opens /app: nothing is created yet.
export function NewOrganizationPage() {
  const navigate = useNavigate();
  const [moscow] = zones;
  return (
    <OrganizationLayout
      header={
        <PageHeader
          title="Создать предприятие"
          caption="Организация объединяет рестораны. Первый ресторан создаётся вместе с ней."
        />
      }
    >
      <CardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void navigate('/app');
        }}
      >
        <FieldGroup>
          <FieldLabel htmlFor="organization-name">
            Название организации
          </FieldLabel>
          <TextInput
            id="organization-name"
            name="organizationName"
            autoComplete="organization"
            placeholder="Например, Северная кухня"
            aria-describedby="organization-name-hint"
          />
          <FieldMessage
            id="organization-name-hint"
            hint="Отображается в меню и письмах-приглашениях."
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="first-restaurant">
            Название первого ресторана
          </FieldLabel>
          <TextInput
            id="first-restaurant"
            name="restaurantName"
            placeholder="Например, На Невском"
          />
        </FieldGroup>
        {moscow && (
          <TimezoneField
            id="new-organization-zone"
            hint="Действует для всех ресторанов организации: даты, сроки и границы периодов отображаются в этой зоне."
            initial={moscow}
          />
        )}
        <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
          <Button type="submit">Создать предприятие</Button>
          <ButtonLink variant="secondary" to="/app/organizations">
            Отмена
          </ButtonLink>
        </Flex>
      </CardForm>
    </OrganizationLayout>
  );
}
