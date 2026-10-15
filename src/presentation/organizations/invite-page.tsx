import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import { type RoleGrant } from '@/application/organizations';
import { PageHeader } from '@/presentation/app-shell/pages';
import { inviteValidity } from '@/presentation/placeholder-organizations';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { CardForm } from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { AssignmentMatrix } from './assignment-matrix';
import { organizationPath } from './format';
import { type OrganizationRoute } from './loaders';
import {
  BackLink,
  OrganizationLayout,
  OrganizationState,
} from './organization-layout';

// Figma IV01. Sending only returns to the invitations list. The matrix lists
// the sample restaurants until the real ones are read.
function InviteForm({ organization }: { organization: OrganizationAccess }) {
  const { orgID, name: organizationName } = organization;
  const [grants, setGrants] = useState<readonly RoleGrant[]>([]);
  const navigate = useNavigate();
  const listPath = `${organizationPath(orgID)}/invitations`;
  return (
    <OrganizationLayout
      header={
        <Stack gap="1">
          <BackLink to={listPath}>Все приглашения</BackLink>
          <PageHeader
            title="Пригласить участника"
            caption={organizationName}
            documentTitle={`Пригласить участника · ${organizationName}`}
          />
        </Stack>
      }
    >
      <CardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(listPath);
        }}
      >
        <FieldGroup>
          <FieldLabel htmlFor="invite-email">Почта</FieldLabel>
          <TextInput
            id="invite-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.ru"
            aria-describedby="invite-email-hint"
          />
          <FieldMessage
            id="invite-email-hint"
            hint="На этот адрес придёт письмо со ссылкой. Существующий пользователь войдёт своей учётной записью."
          />
        </FieldGroup>
        <chakra.h2 textStyle="heading.h3">Рестораны и роли</chakra.h2>
        <AssignmentMatrix
          id="invite-roles"
          restaurants={organization.restaurants.filter(
            (restaurant) =>
              restaurant.lifecycle === 'ready' ||
              restaurant.lifecycle === 'registering',
          )}
          value={grants}
          onChange={setGrants}
          readyOnly
        />
        <Text textStyle="caption.default" color="text.secondary">
          {inviteValidity}
        </Text>
        <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
          <Button type="submit">Отправить приглашение</Button>
          <ButtonLink variant="secondary" to={listPath}>
            Отмена
          </ButtonLink>
        </Flex>
      </CardForm>
    </OrganizationLayout>
  );
}

export function InvitePage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => <InviteForm organization={organization} />}
    </OrganizationState>
  );
}
