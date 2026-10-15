import { Text, chakra } from '@chakra-ui/react';
import { useEffect, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import type { RestaurantAccess } from '@/application/access';
import { orgKeys } from '@/application/organization-commands';
import type { Member } from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { useAttempts } from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { organizationPath } from './format';
import {
  assignmentLines,
  revokeMessage,
  revokeOutcomeState,
  type RevokedState,
  type RevokeState,
} from './members';

export const revokeTitle = 'Отозвать доступ участника?';

// Figma RV01 to RV06. «Отмена» comes first and gets the initial focus. The
// dialog stays open until Auth answers: «Отозвать доступ» leaves for the list
// with RV03, a refusal is shown inside.
//
// present: the member is still in the list. A conflict with the member gone
// is RV06; with the member still there the data moved on.
export function RevokeAccessDialog({
  dialogRef,
  orgID,
  organizationName,
  member,
  restaurants,
  present,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  orgID: string;
  organizationName: string;
  member: Member;
  restaurants: readonly RestaurantAccess[];
  present: boolean;
}) {
  const { organizations } = useServices();
  const { commands } = organizations;
  const navigate = useNavigate();
  const [stored, setStored] = useState<RevokeState>({ kind: 'confirm' });
  const { membershipID } = member.membership;
  // Subscribed, so the dialog follows an attempt that settles elsewhere.
  useAttempts();

  // Any closing (Esc, «Отмена», «Закрыть») starts the next opening from the
  // confirmation, unless the command is on its way.
  useEffect(() => {
    const element = dialogRef.current;
    const reset = () => {
      setStored((state) =>
        state.kind === 'revoking' ? state : { kind: 'confirm' },
      );
    };
    element?.addEventListener('close', reset);
    return () => {
      element?.removeEventListener('close', reset);
    };
  }, [dialogRef]);

  const state: RevokeState =
    stored.kind === 'revoking'
      ? stored
      : commands.isUnsettled(orgKeys.revokeMembership(membershipID))
        ? { kind: 'unknown' }
        : stored.kind === 'changed' && !present
          ? { kind: 'already' }
          : stored;
  const name = member.displayName;
  const listPath = `${organizationPath(orgID)}/members`;
  const message = revokeMessage(state, name);
  const revoking = state.kind === 'revoking';
  const close = () => dialogRef.current?.close();

  const revoke = async () => {
    setStored({ kind: 'revoking' });
    const outcome = await commands.revokeMember(member);
    const next = revokeOutcomeState(outcome);
    if (next === 'done') {
      close();
      const leaving: RevokedState = { revoked: name };
      void navigate(listPath, { state: leaving });
      return;
    }
    // A command that found the member gone does not read the list itself.
    if (outcome.kind === 'gone') organizations.reads.members(orgID).refresh();
    setStored(next);
  };

  const confirming = message === undefined;
  const retry = state.kind === 'unavailable';
  const checking = state.kind === 'unknown';
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title={message?.title ?? revokeTitle}
      locked={revoking}
      onSubmit={(event) => {
        event.preventDefault();
        if (!revoking && (confirming || retry || checking)) void revoke();
      }}
      actions={
        state.kind === 'already' ? (
          <ButtonLink to={listPath}>Вернуться к участникам</ButtonLink>
        ) : confirming || retry ? (
          <>
            <Button variant="secondary" disabled={revoking} onClick={close}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={revoking}
              aria-busy={revoking ? true : undefined}
            >
              Отозвать доступ
            </Button>
          </>
        ) : checking ? (
          <>
            <Button type="submit">Проверить результат</Button>
            <Button variant="secondary" onClick={close}>
              Закрыть
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close}>
            Закрыть
          </Button>
        )
      }
    >
      {message ? (
        <Text textStyle="body.default">{message.text}</Text>
      ) : (
        <>
          <Text textStyle="body.default">
            {`${name} потеряет доступ к организации «${organizationName}» и ко всем назначениям:`}
          </Text>
          {/* A real list for screen readers; Figma draws inline bullets. */}
          <chakra.ul listStyleType="none" textStyle="body.default">
            {assignmentLines(member, restaurants).map((line) => (
              <chakra.li key={line} _before={{ content: '"• "' }}>
                {line}
              </chakra.li>
            ))}
          </chakra.ul>
          <Text textStyle="caption.default" color="text.secondary">
            Учётная запись сохранится. Незавершённые действия участника в
            организации будут прерваны.
          </Text>
          {revoking && (
            <Text role="status" textStyle="body.default">
              Отзываем…
            </Text>
          )}
        </>
      )}
    </ModalPanel>
  );
}
