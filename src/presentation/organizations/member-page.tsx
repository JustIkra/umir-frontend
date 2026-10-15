import { Stack, Text, chakra } from '@chakra-ui/react';
import { useRef } from 'react';
import { useLoaderData } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { NotFoundPage } from '@/presentation/documents/not-found-page';
import { administeredSample } from '@/presentation/placeholder-organizations';
import { Button } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { AssignmentMatrix } from './assignment-matrix';
import { organizationPath } from './format';
import { type MemberRoute } from './loaders';
import {
  BackLink,
  OrganizationLayout,
  OrganizationState,
} from './organization-layout';
import { RevokeAccessDialog } from './revoke-access-dialog';

function MemberCard({
  orgID,
  organizationName,
  membershipID,
}: {
  orgID: string;
  organizationName: string;
  membershipID: string;
}) {
  const organization = administeredSample;
  const member = organization.members.find(
    (candidate) => candidate.id === membershipID && !candidate.admin,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  if (!member) return <NotFoundPage />;
  return (
    <OrganizationLayout
      header={
        <Stack gap="1">
          <BackLink to={`${organizationPath(orgID)}/members`}>
            Все участники
          </BackLink>
          <PageHeader
            title={member.name}
            caption={member.email}
            documentTitle={`${member.name} · ${organizationName}`}
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
        orgID={orgID}
        organization={organization}
        member={member}
      />
    </OrganizationLayout>
  );
}

// Figma MM01. Changes are not tracked, so «Сохранить назначения» stays
// unavailable as in the frame. The card is a sample member until Auth's
// members are read.
export function MemberPage() {
  const { orgID, membershipID } = useLoaderData<MemberRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <MemberCard
          orgID={orgID}
          organizationName={organization.name}
          membershipID={membershipID}
        />
      )}
    </OrganizationState>
  );
}
