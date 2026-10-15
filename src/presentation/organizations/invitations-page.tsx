import { Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useLoaderData, useLocation } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import { orgKeys } from '@/application/organization-commands';
import type {
  InvitationList as InvitationListModel,
  InvitationRow,
} from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { useAttempts, useReadModel } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { FormMessage } from '@/presentation/ui/form-message';
import {
  ServiceUnavailableAlert,
  UnknownOutcomeAlert,
} from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import { zoneLabel } from '@/presentation/ui/zones';
import { CancelInvitationDialog } from './cancel-invitation-dialog';
import { organizationPath } from './format';
import { InvitationList } from './invitation-list';
import {
  cancelMessage,
  cancelOutcomeState,
  cancelledNotice,
  invitedEmail,
  invitedNotice,
  newestFirst,
  resendResult,
  type InvitationNotice,
} from './invitations';
import { type OrganizationRoute } from './loaders';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';

interface Notice extends InvitationNotice {
  readonly tone: 'success' | 'error';
}

// IN03.
function InvitationSkeleton() {
  return (
    <Stack aria-hidden="true" gap="2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} h={rem(88)} borderRadius="md" />
      ))}
    </Stack>
  );
}

// IN02.
function NoInvitations({ invitePath }: { invitePath: string }) {
  return (
    <Card as="section">
      <chakra.h2 textStyle="heading.h3">Приглашений нет</chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        Пригласите сотрудников по почте: укажите рестораны и роли.
      </Text>
      <ButtonLink
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        to={invitePath}
      >
        Пригласить участника
      </ButtonLink>
    </Card>
  );
}

// IN01 with the CX01 dialog for the chosen row. The notices are what the
// last action said (IV07, IN05 and the new link); an action whose answer was
// lost stays over the list until it is checked.
function InvitationsLoaded({
  organization,
  list,
  arrived,
}: {
  organization: OrganizationAccess;
  list: InvitationListModel;
  arrived: Notice | undefined;
}) {
  const { now, organizations } = useServices();
  const { commands } = organizations;
  const { orgID } = organization;
  const { timeZone } = organization.settings;
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<{ id: string; email: string }>();
  const [notice, setNotice] = useState<Notice>();
  useAttempts();
  const invitePath = `${organizationPath(orgID)}/invitations/new`;
  const rows = newestFirst(list.items);
  const shown = notice ?? arrived;
  const resending = (id: string) => commands.isPending(orgKeys.resendLink(id));
  const cancelling = (id: string) =>
    commands.isPending(orgKeys.cancelInvitation(id));
  // The unknown outcome is shown for a lost answer only; a request on its way
  // just locks the row.
  const resendUnknown = (id: string) =>
    commands.isUnsettled(orgKeys.resendLink(id));
  const cancelUnknown = (id: string) =>
    commands.isUnsettled(orgKeys.cancelInvitation(id));

  const resend = async (row: InvitationRow) => {
    const { email, invitationID } = row.invitation;
    const result = resendResult(
      await commands.resendLink(orgID, invitationID),
      email,
    );
    setNotice(
      result === undefined
        ? undefined
        : { tone: result.tone, ...result.notice },
    );
  };
  // The same cancellation again: nothing is planned anew.
  const checkCancel = async (row: InvitationRow) => {
    const { email, invitationID } = row.invitation;
    const next = cancelOutcomeState(
      await commands.cancelInvitation(orgID, invitationID),
    );
    if (next === 'done') {
      setNotice({ tone: 'success', ...cancelledNotice(email) });
      return;
    }
    const message = cancelMessage(
      next.kind === 'closed' && row.invitation.state === 'accepted'
        ? { kind: 'accepted' }
        : next,
      email,
    );
    setNotice(
      message === undefined ? undefined : { tone: 'error', ...message },
    );
  };

  const chosenRow = rows.find(
    (row) => row.invitation.invitationID === chosen?.id,
  );
  return (
    <>
      {shown && (
        <FormMessage tone={shown.tone} title={shown.title}>
          {shown.text}
        </FormMessage>
      )}
      {rows
        .filter((row) => resendUnknown(row.invitation.invitationID))
        .map((row) => (
          <UnknownOutcomeAlert
            key={`resend-${row.invitation.invitationID}`}
            title="Результат повторной отправки неизвестен"
            onCheck={() => {
              void resend(row);
            }}
          >
            {`Ответ сервиса не получен. Ссылка для ${row.invitation.email} могла быть отправлена. Проверка продолжит ту же попытку.`}
          </UnknownOutcomeAlert>
        ))}
      {rows
        .filter((row) => cancelUnknown(row.invitation.invitationID))
        .map((row) => (
          <UnknownOutcomeAlert
            key={`cancel-${row.invitation.invitationID}`}
            title="Результат отмены неизвестен"
            onCheck={() => {
              void checkCancel(row);
            }}
          >
            {`Ответ сервиса не получен. Приглашение для ${row.invitation.email} могло быть отменено. Проверка продолжит ту же попытку.`}
          </UnknownOutcomeAlert>
        ))}
      {rows.length === 0 ? (
        <NoInvitations invitePath={invitePath} />
      ) : (
        <>
          <ButtonLink
            to={invitePath}
            alignSelf={{ base: 'stretch', sm: 'flex-start' }}
          >
            Пригласить участника
          </ButtonLink>
          <InvitationList
            rows={rows}
            restaurants={organization.restaurants}
            timeZone={timeZone}
            invitePath={invitePath}
            busy={(id) => resending(id) || cancelling(id)}
            onCancel={(row) => {
              setChosen({
                id: row.invitation.invitationID,
                email: row.invitation.email,
              });
              setNotice(undefined);
              dialog.current?.showModal();
            }}
            onResend={(row) => {
              void resend(row);
            }}
          />
          <Text textStyle="caption.default" color="text.secondary">
            {`Время — ${zoneLabel(timeZone, now())}.`}
          </Text>
        </>
      )}
      <CancelInvitationDialog
        dialogRef={dialog}
        orgID={orgID}
        invitationID={chosen?.id ?? ''}
        email={chosen?.email ?? ''}
        row={chosenRow}
        onCancelled={(email) => {
          setNotice({ tone: 'success', ...cancelledNotice(email) });
        }}
      />
    </>
  );
}

function InvitationsBody({
  organization,
}: {
  organization: OrganizationAccess;
}) {
  const { organizations } = useServices();
  const model = organizations.reads.invitations(organization.orgID);
  const snapshot = useReadModel(model);
  const sent = invitedEmail(useLocation().state);
  const arrived: Notice | undefined =
    sent === undefined
      ? undefined
      : { tone: 'success', ...invitedNotice(sent) };
  if (snapshot.value !== undefined) {
    return (
      <InvitationsLoaded
        organization={organization}
        list={snapshot.value}
        arrived={arrived}
      />
    );
  }
  return (
    <>
      {arrived && (
        <FormMessage tone={arrived.tone} title={arrived.title}>
          {arrived.text}
        </FormMessage>
      )}
      {snapshot.failed ? (
        <ServiceUnavailableAlert
          title="Список приглашений не получен"
          onRetry={() => {
            model.refresh();
          }}
        >
          Сервис авторизации не отвечает. Это не означает, что приглашений нет.
        </ServiceUnavailableAlert>
      ) : (
        <InvitationSkeleton />
      )}
    </>
  );
}

// Figma IN01 to IN05: the invitations of Auth, new first.
export function InvitationsPage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <OrganizationLayout
          header={
            <OrganizationHeader
              organization={organization}
              section="Приглашения"
            />
          }
        >
          <OrganizationTabs orgID={orgID} />
          <InvitationsBody organization={organization} />
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
