import { Stack, Text, chakra } from '@chakra-ui/react';
import { useRef } from 'react';
import { useLoaderData } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { Button } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { AssignmentMatrix } from './assignment-matrix';
import { organizationPath } from './format';
import { type MemberData } from './loaders';
import { BackLink, OrganizationLayout } from './organization-layout';
import { RevokeAccessDialog } from './revoke-access-dialog';

// Figma MM01. Changes are not tracked, so «Сохранить назначения» stays
// unavailable as in the frame.
export function MemberPage() {
  const { organization, member } = useLoaderData<MemberData>();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <OrganizationLayout
      header={
        <Stack gap="1">
          <BackLink to={`${organizationPath(organization)}/members`}>
            Все участники
          </BackLink>
          <PageHeader
            title={member.name}
            caption={member.email}
            documentTitle={`${member.name} · ${organization.name}`}
          />
        </Stack>
      }
    >
      <Card as="section">
        <chakra.h2 textStyle="heading.h3">Назначения в ресторанах</chakra.h2>
        <AssignmentMatrix
          id="member-roles"
          restaurants={organization.restaurants}
          roles={member.roles}
        />
        <Button alignSelf={{ base: 'stretch', sm: 'flex-start' }} disabled>
          Сохранить назначения
        </Button>
      </Card>
      <Card as="section">
        <chakra.h2 textStyle="heading.h3">Доступ к организации</chakra.h2>
        <Text textStyle="body.default" color="text.secondary">
          Отзыв закрывает все назначения участника в организации. Учётная запись
          сохранится.
        </Text>
        <Button
          variant="secondary"
          alignSelf={{ base: 'stretch', sm: 'flex-start' }}
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          Отозвать доступ
        </Button>
      </Card>
      <RevokeAccessDialog
        dialogRef={dialog}
        organization={organization}
        member={member}
      />
    </OrganizationLayout>
  );
}
