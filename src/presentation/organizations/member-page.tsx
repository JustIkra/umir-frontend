import { Flex, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import {
  type OrganizationAccess,
  type RestaurantAccess,
} from '@/application/access';
import type {
  Member,
  MemberList,
  RoleGrant,
} from '@/application/organizations';
import type { SaveAssignmentsOutcome } from '@/application/organization-commands';
import type { ReadModel } from '@/application/read-model';
import { PageHeader } from '@/presentation/app-shell/pages';
import { NotFoundPage } from '@/presentation/documents/not-found-page';
import { useServices } from '@/presentation/services';
import {
  useAttempts,
  useReadModel,
  useSession,
} from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Card, CardForm } from '@/presentation/ui/card';
import { FormMessage } from '@/presentation/ui/form-message';
import { ServiceUnavailableAlert, StateCard } from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { AdminRoleCard } from './admin-role-card';
import { AssignmentMatrix } from './assignment-matrix';
import { organizationPath } from './format';
import { type MemberRoute } from './loaders';
import {
  assignmentsMessage,
  assignmentsOutcomeState,
  changedRestaurants,
  editableRestaurants,
  grantsOf,
  offeredRestaurants,
  type AssignmentsState,
} from './members';
import {
  BackLink,
  OrganizationLayout,
  OrganizationState,
} from './organization-layout';
import { RevokeAccessDialog } from './revoke-access-dialog';

const noChanges: ReadonlySet<string> = new Set();

function MemberHeader({
  orgID,
  title,
  caption,
  documentTitle,
}: {
  orgID: string;
  title: string;
  caption?: string;
  documentTitle: string;
}) {
  return (
    <Stack gap="1">
      <BackLink to={`${organizationPath(orgID)}/members`}>
        Все участники
      </BackLink>
      <PageHeader
        title={title}
        caption={caption}
        documentTitle={documentTitle}
      />
    </Stack>
  );
}

function AssignmentsCard({
  member,
  restaurants,
  editable,
  model,
  revoking,
}: {
  member: Member;
  restaurants: readonly RestaurantAccess[];
  editable: ReadonlySet<string>;
  model: ReadModel<MemberList>;
  // The revoke is without a known outcome: the card is locked.
  revoking: boolean;
}) {
  const { organizations } = useServices();
  const { commands } = organizations;
  const { membershipID } = member.membership;
  useAttempts();
  const storedGrants = grantsOf(member);
  const [draft, setDraft] = useState<readonly RoleGrant[]>();
  const [stored, setStored] = useState<AssignmentsState>({ kind: 'view' });
  // The change that has no known outcome is shown as it was sent.
  const pending = commands.pendingMembership(membershipID);
  const unsettledSave =
    pending?.kind === 'assignments' || pending?.kind === 'revoke-assignments';
  const value =
    pending?.kind === 'assignments'
      ? pending.grants
      : pending?.kind === 'revoke-assignments'
        ? storedGrants.filter((grant) =>
            member.membership.assignments.every(
              (assignment) =>
                assignment.restaurantID !== grant.restaurantID ||
                !pending.assignmentIDs.includes(assignment.assignmentID),
            ),
          )
        : (draft ?? storedGrants);
  const changed = changedRestaurants(storedGrants, value);
  const differs = changed.size > 0;

  const state: AssignmentsState =
    stored.kind === 'saving'
      ? stored
      : unsettledSave
        ? { kind: 'unknown' }
        : stored.kind === 'view' && differs
          ? { kind: 'changed' }
          : stored;
  const message = assignmentsMessage(state);
  const saving = state.kind === 'saving';
  // While the membership has an attempt without an outcome, or the answer is
  // awaited, nothing of the card may change it.
  const locked = saving || pending !== undefined || revoking;
  const canSave =
    differs && !locked && state.kind !== 'saved' && state.kind !== 'conflict';

  const settle = (outcome: SaveAssignmentsOutcome) => {
    // A membership that is gone is not reread by the command itself.
    if (outcome.kind === 'gone') model.refresh();
    setStored(assignmentsOutcomeState(outcome));
  };
  const save = async () => {
    setStored({ kind: 'saving' });
    settle(await commands.saveAssignments(member, value, editable));
  };
  // The same attempts again: nothing is planned anew from the form.
  const check = async () => {
    setDraft(value);
    setStored({ kind: 'saving' });
    settle(await commands.checkMembership(member));
  };
  const cancel = () => {
    setDraft(undefined);
    setStored({ kind: 'view' });
  };
  const refreshForm = () => {
    model.refresh();
    cancel();
  };

  return (
    <CardForm
      noValidate
      aria-labelledby="member-roles-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void save();
      }}
    >
      <chakra.h2 id="member-roles-title" textStyle="heading.h3">
        Назначения в ресторанах
      </chakra.h2>
      <AssignmentMatrix
        id="member-roles"
        restaurants={restaurants}
        value={value}
        onChange={(next) => {
          setDraft(next);
          setStored({ kind: 'view' });
        }}
        disabled={locked || state.kind === 'conflict'}
        changed={state.kind === 'saved' ? noChanges : changed}
      />
      {message && (state.kind === 'changed' || state.kind === 'saving') && (
        <Text role="status" textStyle="body.default" color="text.secondary">
          {message.text}
        </Text>
      )}
      {message && state.kind === 'unknown' && (
        <FormMessage
          tone="unknown"
          title={message.title ?? ''}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void check();
              }}
            >
              Проверить сохранение
            </Button>
          }
        >
          {message.text}
        </FormMessage>
      )}
      {message && state.kind === 'conflict' && (
        <FormMessage
          tone="error"
          title={message.title ?? ''}
          action={
            <Button variant="secondary" onClick={refreshForm}>
              Обновить форму
            </Button>
          }
        >
          {message.text}
        </FormMessage>
      )}
      {message?.title !== undefined &&
        state.kind !== 'unknown' &&
        state.kind !== 'conflict' && (
          <FormMessage tone={message.tone} title={message.title}>
            {message.text}
          </FormMessage>
        )}
      <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
        <Button
          type="submit"
          disabled={!canSave}
          aria-busy={saving ? true : undefined}
        >
          Сохранить назначения
        </Button>
        {differs && !saving && pending === undefined && (
          <Button variant="secondary" onClick={cancel}>
            Отменить изменения
          </Button>
        )}
      </Flex>
    </CardForm>
  );
}

function MemberCards({
  organization,
  member,
  model,
  locked,
  onRevoke,
}: {
  organization: OrganizationAccess;
  member: Member;
  model: ReadModel<MemberList>;
  // Another command of the membership is unsettled: «Отозвать доступ» waits.
  locked: boolean;
  onRevoke: () => void;
}) {
  const { commands } = useServices().organizations;
  const { membershipID } = member.membership;
  useAttempts();
  const editable = editableRestaurants(organization.restaurants);
  const offered = offeredRestaurants(organization.restaurants);
  const pendingKind = commands.pendingMembership(membershipID)?.kind;
  const revoking = pendingKind === 'revoke';
  return (
    <>
      <AssignmentsCard
        member={member}
        restaurants={offered}
        editable={editable}
        model={model}
        revoking={revoking}
      />
      <AdminRoleCard
        member={member}
        organization={organization}
        model={model}
        blocked={pendingKind !== undefined && pendingKind !== 'admin'}
      />
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
          disabled={locked}
          onClick={onRevoke}
        >
          Отозвать доступ
        </Button>
      </Card>
    </>
  );
}

// MM09 (and the header of a card that is not read yet): the member is no
// longer in the list read from Auth.
function MemberGone({ orgID }: { orgID: string }) {
  return (
    <StateCard
      icon={userIcon}
      title="Участник больше не состоит в организации"
      actions={
        <ButtonLink to={`${organizationPath(orgID)}/members`}>
          Вернуться к участникам
        </ButtonLink>
      }
    >
      Доступ этого участника к организации отозван. Назначения изменить нельзя.
    </StateCard>
  );
}

function MemberBody({
  organization,
  membershipID,
}: {
  organization: OrganizationAccess;
  membershipID: string;
}) {
  const { orgID } = organization;
  const { organizations } = useServices();
  const { commands } = organizations;
  const model = organizations.reads.members(orgID);
  const snapshot = useReadModel(model);
  const session = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  useAttempts();
  const found = snapshot.value?.items.find(
    (item) => item.membership.membershipID === membershipID,
  );
  // The dialog outlives the member: a conflict that finds the member gone
  // is RV06, shown in the same dialog.
  const [lastSeen, setLastSeen] = useState(found);
  if (found !== undefined && found !== lastSeen) setLastSeen(found);
  // D7: nobody edits or revokes their own access.
  if (
    found !== undefined &&
    session.status === 'active' &&
    found.membership.userID === session.user.userID
  ) {
    return <NotFoundPage />;
  }
  const dialogMember = found ?? lastSeen;
  // Another change of the membership has no known outcome: «Отозвать доступ»
  // waits. A revoke that is unsettled is checked in the dialog.
  const pending = commands.pendingMembership(membershipID);
  const locked = pending !== undefined && pending.kind !== 'revoke';

  let content;
  if (snapshot.value === undefined) {
    content = (
      <OrganizationLayout
        header={
          <MemberHeader
            orgID={orgID}
            title="Участник"
            documentTitle={`Участник · ${organization.name}`}
          />
        }
      >
        {snapshot.failed ? (
          <ServiceUnavailableAlert
            title="Данные участника не получены"
            onRetry={() => {
              model.refresh();
            }}
          >
            Сервис авторизации не отвечает. Это не означает, что участник больше
            не состоит в организации.
          </ServiceUnavailableAlert>
        ) : (
          <Stack aria-hidden="true" gap={{ base: '4', sm: '6' }}>
            <Skeleton h={rem(240)} borderRadius="md" />
            <Skeleton h={rem(112)} borderRadius="md" />
          </Stack>
        )}
      </OrganizationLayout>
    );
  } else if (found === undefined) {
    content = (
      <OrganizationLayout
        header={
          <BackLink to={`${organizationPath(orgID)}/members`}>
            Все участники
          </BackLink>
        }
      >
        <MemberGone orgID={orgID} />
      </OrganizationLayout>
    );
  } else {
    content = (
      <OrganizationLayout
        header={
          <MemberHeader
            orgID={orgID}
            title={found.displayName}
            {...(found.email === undefined ? {} : { caption: found.email })}
            documentTitle={`${found.displayName} · ${organization.name}`}
          />
        }
      >
        <MemberCards
          organization={organization}
          member={found}
          model={model}
          locked={locked}
          onRevoke={() => dialog.current?.showModal()}
        />
      </OrganizationLayout>
    );
  }
  return (
    <>
      {content}
      {dialogMember !== undefined && (
        <RevokeAccessDialog
          dialogRef={dialog}
          orgID={orgID}
          organizationName={organization.name}
          member={dialogMember}
          restaurants={organization.restaurants}
          present={found !== undefined}
        />
      )}
    </>
  );
}

// Figma MM01 to MM09: the member from the list of Auth, the boxes are the
// assignments under the membership version that was read.
export function MemberPage() {
  const { orgID, membershipID } = useLoaderData<MemberRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <MemberBody organization={organization} membershipID={membershipID} />
      )}
    </OrganizationState>
  );
}
