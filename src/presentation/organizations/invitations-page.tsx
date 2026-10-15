import { type OrganizationAccess } from '@/application/access';
import { Text } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import { administeredSample } from '@/presentation/placeholder-organizations';
import { useServices } from '@/presentation/services';
import { ButtonLink } from '@/presentation/ui/actions';
import { CancelInvitationDialog } from './cancel-invitation-dialog';
import { organizationPath, zoneLine } from './format';
import { InvitationList } from './invitation-list';
import { type OrganizationRoute } from './loaders';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';

// Figma IN01 with the CX01 dialog for the chosen row. The rows are the sample
// until the invitations are read from Auth.
function Invitations({ organization }: { organization: OrganizationAccess }) {
  const { now } = useServices();
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const invitePath = `${organizationPath(organization.orgID)}/invitations/new`;
  return (
    <OrganizationLayout
      header={
        <OrganizationHeader organization={organization} section="Приглашения" />
      }
    >
      <OrganizationTabs orgID={organization.orgID} />
      <ButtonLink
        to={invitePath}
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
      >
        Пригласить участника
      </ButtonLink>
      <InvitationList
        invitations={administeredSample.invitations}
        invitePath={invitePath}
        onCancel={(chosen) => {
          setEmail(chosen);
          dialog.current?.showModal();
        }}
      />
      <Text textStyle="caption.default" color="text.secondary">
        {`Время — ${zoneLine(organization.settings.timeZone, now())}.`}
      </Text>
      <CancelInvitationDialog dialogRef={dialog} email={email} />
    </OrganizationLayout>
  );
}

export function InvitationsPage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => <Invitations organization={organization} />}
    </OrganizationState>
  );
}
