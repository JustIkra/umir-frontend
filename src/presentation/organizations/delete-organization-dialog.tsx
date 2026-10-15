import { Text } from '@chakra-ui/react';
import { useEffect, useState, type RefObject } from 'react';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { FieldGroup, FieldLabel, TextInput } from '@/presentation/ui/form';
import { canConfirmDeletion, deletionMessage } from './deletion';
import { useOrganizationDeletion } from './use-deletion';

export const deleteOrganizationTitle = (name: string) =>
  `Удалить организацию «${name}»?`;

// The deletion of an organization; no Figma frame. The button works only when
// the name is typed exactly. «Отмена» comes first and gets the initial focus.
// The dialog stays open until Auth answers; an accepted deletion closes it and
// the page leaves for the list of organizations.
export function DeleteOrganizationDialog({
  dialogRef,
  orgID,
  name,
  onDeleted,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  orgID: string;
  name: string;
  onDeleted: () => void;
}) {
  const [input, setInput] = useState('');
  const {
    stored: state,
    run,
    reset,
  } = useOrganizationDeletion(orgID, name, () => {
    dialogRef.current?.close();
    onDeleted();
  });
  useEffect(() => {
    const element = dialogRef.current;
    const closed = () => {
      setInput('');
      reset();
    };
    element?.addEventListener('close', closed);
    return () => {
      element?.removeEventListener('close', closed);
    };
  }, [dialogRef, reset]);
  const deleting = state.kind === 'deleting';
  const message =
    state.kind === 'done'
      ? undefined
      : deletionMessage('organization', state, name);
  const confirming = message === undefined;
  const retry = state.kind === 'unavailable';
  const checking = state.kind === 'unknown';
  const matches = canConfirmDeletion(input, name);
  const close = () => dialogRef.current?.close();
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title={message?.title ?? deleteOrganizationTitle(name)}
      locked={deleting}
      onSubmit={(event) => {
        event.preventDefault();
        if (deleting) return;
        if (checking || ((confirming || retry) && matches)) void run();
      }}
      actions={
        state.kind === 'gone' ? (
          <ButtonLink to="/app/organizations">Все организации</ButtonLink>
        ) : confirming || retry ? (
          <>
            <Button variant="secondary" disabled={deleting} onClick={close}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!matches || deleting}
              aria-busy={deleting ? true : undefined}
            >
              Удалить организацию
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
            Все участники потеряют доступ ко всем ресторанам организации.
            Учётные записи сохранятся. Отменить удаление нельзя.
          </Text>
          <FieldGroup>
            <FieldLabel htmlFor="delete-organization-name">
              Введите название организации, чтобы подтвердить
            </FieldLabel>
            <TextInput
              id="delete-organization-name"
              name="organizationName"
              autoComplete="off"
              placeholder={name}
              value={input}
              disabled={deleting}
              onChange={(event) => {
                setInput(event.currentTarget.value);
              }}
            />
          </FieldGroup>
          {deleting && (
            <Text role="status" textStyle="body.default">
              Удаляем…
            </Text>
          )}
        </>
      )}
    </ModalPanel>
  );
}
