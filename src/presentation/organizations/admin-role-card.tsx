import { Text, chakra } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import type { OrganizationAccess } from '@/application/access';
import type { Member, MemberList } from '@/application/organizations';
import type { ReadModel } from '@/application/read-model';
import { useServices } from '@/presentation/services';
import { useAttempts } from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { ModalPanel } from '@/presentation/ui/dialog';
import { FormMessage } from '@/presentation/ui/form-message';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import {
  adminMessage,
  adminOutcomeState,
  editableRestaurants,
  type AdminState,
} from './members';

// The card «Администратор организации» of the member page (D7: not on one's
// own page). «Назначить администратором» and «Снять роль администратора» ask
// for a confirmation; the dialog stays open until Auth answers, and the answer
// is shown in the card. A change without a known outcome is checked with the
// same attempt, whatever the card shows now.
export function AdminRoleCard({
  member,
  organization,
  model,
  blocked,
}: {
  member: Member;
  organization: OrganizationAccess;
  model: ReadModel<MemberList>;
  // Another change of the membership has no known outcome.
  blocked: boolean;
}) {
  const { commands } = useServices().organizations;
  const dialog = useRef<HTMLDialogElement>(null);
  useAttempts();
  const { membershipID, orgRoles } = member.membership;
  const isAdmin = orgRoles.includes('Admin');
  const [stored, setStored] = useState<AdminState>({ kind: 'view' });
  // The value being asked for: the card changes under the dialog as soon as
  // the list is read again.
  const [asked, setAsked] = useState<boolean>();
  const pending = commands.pendingMembership(membershipID);
  const unsettled = pending?.kind === 'admin' ? pending : undefined;
  const state: AdminState =
    stored.kind === 'saving'
      ? stored
      : unsettled !== undefined
        ? { kind: 'unknown' }
        : stored;
  const message = adminMessage(state);
  const saving = state.kind === 'saving';
  const locked = saving || blocked || state.kind === 'unknown';
  const target = asked ?? !isAdmin;
  const name = member.displayName;

  const run = async (admin: boolean) => {
    setAsked(admin);
    setStored({ kind: 'saving' });
    const outcome = await commands.setAdmin(
      member,
      admin,
      editableRestaurants(organization.restaurants),
    );
    dialog.current?.close();
    // A membership that is gone is not read again by the command itself.
    if (outcome.kind === 'gone') model.refresh();
    setAsked(undefined);
    setStored(adminOutcomeState(outcome, admin));
  };

  return (
    <Card as="section" aria-labelledby="member-admin-title">
      <chakra.h2 id="member-admin-title" textStyle="heading.h3">
        Администратор организации
      </chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        {isAdmin
          ? 'Участник — администратор организации.'
          : 'Администратор управляет участниками, приглашениями, ресторанами и настройками организации и работает во всех её ресторанах.'}
      </Text>
      {message && state.kind === 'saving' && (
        <Text role="status" textStyle="body.default" color="text.secondary">
          {message.text}
        </Text>
      )}
      {message && state.kind === 'unknown' && (
        <UnknownOutcomeAlert
          title={message.title ?? ''}
          onCheck={() => {
            if (unsettled !== undefined) void run(unsettled.admin);
          }}
        >
          {message.text}
        </UnknownOutcomeAlert>
      )}
      {message?.title !== undefined &&
        state.kind !== 'unknown' &&
        state.kind !== 'saving' && (
          <FormMessage tone={message.tone} title={message.title}>
            {message.text}
          </FormMessage>
        )}
      <Button
        variant="secondary"
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        aria-haspopup="dialog"
        disabled={locked}
        onClick={() => {
          setStored({ kind: 'view' });
          dialog.current?.showModal();
        }}
      >
        {isAdmin ? 'Снять роль администратора' : 'Назначить администратором'}
      </Button>
      <ModalPanel
        dialogRef={dialog}
        width={520}
        title={
          target ? 'Назначить администратором?' : 'Снять роль администратора?'
        }
        locked={saving}
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked) void run(target);
        }}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => dialog.current?.close()}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={locked}
              aria-busy={saving ? true : undefined}
            >
              {target ? 'Назначить' : 'Снять роль'}
            </Button>
          </>
        }
      >
        {target ? (
          <Text textStyle="body.default">
            {`${name} получит доступ ко всем ресторанам организации «${organization.name}» и сможет управлять участниками, приглашениями, ресторанами и настройками.`}
          </Text>
        ) : (
          <>
            <Text textStyle="body.default">
              {`${name} перестанет быть администратором организации «${organization.name}». Назначения в ресторанах сохранятся.`}
            </Text>
            <Text textStyle="caption.default" color="text.secondary">
              Если назначений нет, участник не увидит ни одного ресторана.
            </Text>
          </>
        )}
        {saving && (
          <Text role="status" textStyle="body.default">
            Сохраняем…
          </Text>
        )}
      </ModalPanel>
    </Card>
  );
}
