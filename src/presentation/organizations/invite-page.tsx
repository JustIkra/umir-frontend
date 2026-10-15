import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { type OrganizationAccess } from '@/application/access';
import type { InviteInput } from '@/application/organization-commands';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useServices } from '@/presentation/services';
import {
  useAttempts,
  useReadModel,
  useSession,
} from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { CardForm } from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import { AssignmentMatrix } from './assignment-matrix';
import { organizationPath } from './format';
import {
  inviteFieldErrors,
  inviteMessage,
  inviteOutcomeState,
  inviteTerm,
  pendingExpiry,
  reinviteNotice,
  validateInvite,
  type InvitedState,
  type InviteState,
} from './invitations';
import { type OrganizationRoute } from './loaders';
import { offeredRestaurants, readyRestaurants } from './members';
import {
  BackLink,
  OrganizationLayout,
  OrganizationState,
} from './organization-layout';

const empty: InviteInput = { email: '', grants: [] };

// Figma IV01 to IV10. The matrix offers the restaurants that are ready (D15).
// An invitation whose answer was lost shows the input it was sent with and
// stays locked: «Проверить результат» sends that attempt again.
function InviteForm({ organization }: { organization: OrganizationAccess }) {
  const { orgID, name: organizationName } = organization;
  const { timeZone } = organization.settings;
  const { now, organizations } = useServices();
  const { commands, reads } = organizations;
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const from = params.get('from');
  const membersModel = reads.members(orgID);
  const invitationsModel = reads.invitations(orgID);
  const members = useReadModel(membersModel).value?.items;
  const rows = useReadModel(invitationsModel).value?.items;
  useAttempts();

  const ready = readyRestaurants(organization.restaurants);
  const listPath = `${organizationPath(orgID)}/invitations`;

  // IV10: an old invitation, kept to the restaurants that are ready now.
  const source =
    from === null
      ? undefined
      : rows?.find((row) => row.invitation.invitationID === from);
  const copied: InviteInput | undefined = source && {
    email: source.invitation.email,
    grants: source.invitation.assignments.filter((grant) =>
      ready.has(grant.restaurantID),
    ),
  };

  const pending = commands.pendingInvite(orgID);
  const [draft, setDraft] = useState<InviteInput>();
  const [stored, setStored] = useState<InviteState>({ kind: 'editing' });
  const value = pending ?? draft ?? copied ?? empty;

  const state: InviteState =
    stored.kind === 'sending'
      ? stored
      : pending !== undefined
        ? { kind: 'unknown' }
        : stored.kind === 'invited'
          ? {
              kind: 'invited',
              expiresAt: pendingExpiry(value.email, rows ?? []),
            }
          : stored;
  const locked = state.kind === 'sending' || pending !== undefined;

  const messageBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stored.kind === 'invalid') messageBox.current?.focus();
  }, [stored]);

  // IV02a: a field that is right now loses its text, the message stays.
  const current =
    state.kind === 'invalid' ? validateInvite(value, members) : undefined;
  const fields = inviteFieldErrors(
    current?.kind === 'invalid' ? current : { kind: 'editing' },
  );
  const message = inviteMessage(state, timeZone);
  const fieldText = state.kind === 'member' || state.kind === 'invited';

  const send = async (input: InviteInput) => {
    setStored({ kind: 'sending' });
    const outcome = await commands.invite(orgID, input.email, input.grants);
    const next = inviteOutcomeState(outcome);
    if (next === 'done') {
      const leaving: InvitedState = { invited: input.email };
      void navigate(listPath, { state: leaving });
      return;
    }
    // The command does not read the list for an address that is invited.
    if (outcome.kind === 'invited') invitationsModel.refresh();
    setStored(next);
  };
  const submit = () => {
    // The attempt that has no known outcome is sent again as it was.
    if (pending !== undefined) {
      void send(pending);
      return;
    }
    const problem = validateInvite(value, members);
    if (problem !== undefined) {
      setStored(problem);
      return;
    }
    void send({
      email: value.email.trim(),
      grants: value.grants.filter(
        (grant) => ready.has(grant.restaurantID) && grant.roles.length > 0,
      ),
    });
  };

  const own =
    state.kind === 'member' &&
    session.status === 'active' &&
    members?.some(
      (member) =>
        member.membership.membershipID === state.membershipID &&
        member.membership.userID === session.user.userID,
    ) === true;
  const notice = source && reinviteNotice(source, timeZone);
  const sending = state.kind === 'sending';
  const emailError = fieldText ? message?.text : fields.email;

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
          if (!locked) submit();
        }}
      >
        {notice && (
          <FormMessage tone="info" title={notice.title}>
            {notice.text}
          </FormMessage>
        )}
        {message && !fieldText && (
          <Box ref={messageBox} tabIndex={-1} outline="none">
            {state.kind === 'unknown' ? (
              <UnknownOutcomeAlert title={message.title ?? ''} onCheck={submit}>
                {message.text}
              </UnknownOutcomeAlert>
            ) : message.title === undefined ? (
              <Text role="status" textStyle="body.default">
                {message.text}
              </Text>
            ) : (
              <FormMessage tone="error" title={message.title}>
                {message.text}
              </FormMessage>
            )}
          </Box>
        )}
        <FieldGroup>
          <FieldLabel htmlFor="invite-email">Почта</FieldLabel>
          <TextInput
            id="invite-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.ru"
            value={value.email}
            disabled={locked}
            invalid={emailError !== undefined}
            aria-describedby="invite-email-hint"
            onChange={(event) => {
              setDraft({ ...value, email: event.currentTarget.value });
              if (stored.kind === 'member' || stored.kind === 'invited') {
                setStored({ kind: 'editing' });
              }
            }}
          />
          <FieldMessage
            id="invite-email-hint"
            error={emailError}
            hint="На этот адрес придёт письмо со ссылкой. Если аккаунт уже есть, человек просто войдёт в него."
          />
          {state.kind === 'member' && !own && (
            <ButtonLink
              variant="link"
              to={`${organizationPath(orgID)}/members/${state.membershipID}`}
              alignSelf="flex-start"
            >
              Открыть участника
            </ButtonLink>
          )}
        </FieldGroup>
        <chakra.h2 textStyle="heading.h3">Рестораны и роли</chakra.h2>
        <AssignmentMatrix
          id="invite-roles"
          restaurants={offeredRestaurants(organization.restaurants)}
          value={value.grants}
          onChange={(grants) => {
            setDraft({ ...value, grants });
          }}
          disabled={locked}
          readyOnly
        />
        <FieldMessage id="invite-roles-error" error={fields.roles} />
        <Text textStyle="caption.default" color="text.secondary">
          {inviteTerm(now(), timeZone)}
        </Text>
        <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
          <Button
            type="submit"
            disabled={locked}
            aria-busy={sending ? true : undefined}
          >
            Отправить приглашение
          </Button>
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
