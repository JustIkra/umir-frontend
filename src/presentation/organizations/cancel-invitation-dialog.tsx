import { Text } from '@chakra-ui/react';
import { useEffect, useState, type RefObject } from 'react';
import { orgKeys } from '@/application/organization-commands';
import type { InvitationRow } from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { useAttempts } from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { organizationPath } from './format';
import {
  cancelMessage,
  cancelOutcomeState,
  cancelTitle,
  type CancelState,
} from './invitations';

// Figma CX01 to CX05. «Не отменять» comes first and gets the initial focus.
// The dialog stays open until Auth answers: «Отменить приглашение» closes it
// and leaves IN05 to the list, a refusal is shown inside.
//
// row: the invitation of the list now (read again after a refusal), undefined
// until a row is chosen.
export function CancelInvitationDialog({
  dialogRef,
  orgID,
  invitationID,
  email,
  row,
  onCancelled,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  orgID: string;
  invitationID: string;
  email: string;
  row: InvitationRow | undefined;
  onCancelled: (email: string) => void;
}) {
  const { organizations } = useServices();
  const { commands } = organizations;
  const [stored, setStored] = useState<CancelState>({ kind: 'confirm' });
  // Subscribed, so the dialog follows an attempt that settles elsewhere.
  useAttempts();

  // Any closing (Esc, «Не отменять», «Закрыть») starts the next opening from
  // the confirmation, unless the command is on its way.
  useEffect(() => {
    const element = dialogRef.current;
    const reset = () => {
      setStored((state) =>
        state.kind === 'cancelling' ? state : { kind: 'confirm' },
      );
    };
    element?.addEventListener('close', reset);
    return () => {
      element?.removeEventListener('close', reset);
    };
  }, [dialogRef]);

  const unknown = commands.isUnsettled(orgKeys.cancelInvitation(invitationID));
  // A closed invitation is told apart by the list read again: accepted is
  // CX03, anything else is not valid any more.
  const state: CancelState =
    stored.kind === 'cancelling'
      ? stored
      : unknown
        ? { kind: 'unknown' }
        : stored.kind === 'closed' && row?.invitation.state === 'accepted'
          ? { kind: 'accepted' }
          : stored;
  const message = cancelMessage(state, email);
  const cancelling = state.kind === 'cancelling';
  const close = () => dialogRef.current?.close();

  const cancel = async () => {
    setStored({ kind: 'cancelling' });
    const outcome = await commands.cancelInvitation(orgID, invitationID);
    const next = cancelOutcomeState(outcome);
    if (next === 'done') {
      setStored({ kind: 'confirm' });
      close();
      onCancelled(email);
      return;
    }
    setStored(next);
  };

  const confirming = message === undefined;
  const retry = state.kind === 'unavailable';
  const checking = state.kind === 'unknown';
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title={message?.title ?? cancelTitle}
      locked={cancelling}
      onSubmit={(event) => {
        event.preventDefault();
        if (!cancelling && (confirming || retry || checking)) void cancel();
      }}
      actions={
        state.kind === 'accepted' ? (
          <>
            <ButtonLink to={`${organizationPath(orgID)}/members`}>
              Открыть участников
            </ButtonLink>
            <Button variant="secondary" onClick={close}>
              Закрыть
            </Button>
          </>
        ) : confirming || retry ? (
          <>
            <Button variant="secondary" disabled={cancelling} onClick={close}>
              Не отменять
            </Button>
            <Button
              type="submit"
              disabled={cancelling}
              aria-busy={cancelling ? true : undefined}
            >
              Отменить приглашение
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
            {`Приглашение для ${email} будет отменено. Ссылка из письма перестанет действовать.`}
          </Text>
          {cancelling && (
            <Text role="status" textStyle="body.default">
              Отменяем…
            </Text>
          )}
        </>
      )}
    </ModalPanel>
  );
}
