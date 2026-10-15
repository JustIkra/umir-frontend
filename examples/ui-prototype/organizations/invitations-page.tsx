import { Text } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import { type Organization } from '../placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { CancelInvitationDialog } from './cancel-invitation-dialog';
import { organizationPath } from './format';
import { InvitationList } from './invitation-list';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationTabs,
} from './organization-layout';

// Figma IN01 with the CX01 dialog for the chosen row.
export function InvitationsPage() {
  const organization = useLoaderData<Organization>();
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const invitePath = `${organizationPath(organization)}/invitations/new`;
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader organization={organization} section="Приглашения" />
      }
    >
      <OrganizationTabs organization={organization} />
      <ButtonLink
        to={invitePath}
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
      >
        Пригласить участника
      </ButtonLink>
      <InvitationList
        invitations={organization.invitations}
        invitePath={invitePath}
        onCancel={(chosen) => {
          setEmail(chosen);
          dialog.current?.showModal();
        }}
      />
      <Text textStyle="caption.default" color="text.secondary">
        {`Время — ${organization.zone.city}, ${organization.zone.offset}.`}
      </Text>
      <CancelInvitationDialog dialogRef={dialog} email={email} />
    </OrganizationLayout>
  );
}
