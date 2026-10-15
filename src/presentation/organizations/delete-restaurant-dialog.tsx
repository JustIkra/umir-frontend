import { Text } from '@chakra-ui/react';
import { useEffect, type RefObject } from 'react';
import type { RestaurantAccess } from '@/application/access';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { deletionMessage } from './deletion';
import { useRestaurantDeletion } from './use-deletion';

// A restaurant row: the title of the dialog names the restaurant.
export const deleteRestaurantTitle = (name: string) =>
  `Удалить ресторан «${name}»?`;

// The deletion of a restaurant; no Figma frame. «Отмена» comes first and gets
// the initial focus. The dialog stays open until Auth answers: a refusal is
// shown inside, an accepted deletion closes it and the page says the cleanup
// goes on in the background.
export function DeleteRestaurantDialog({
  dialogRef,
  restaurant,
  onDeleted,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  restaurant: RestaurantAccess;
  onDeleted: (name: string) => void;
}) {
  const { name } = restaurant;
  const {
    stored: state,
    run,
    reset,
  } = useRestaurantDeletion(restaurant, (deleted) => {
    dialogRef.current?.close();
    onDeleted(deleted);
  });
  useEffect(() => {
    const element = dialogRef.current;
    element?.addEventListener('close', reset);
    return () => {
      element?.removeEventListener('close', reset);
    };
  }, [dialogRef, reset]);
  const deleting = state.kind === 'deleting';
  const message =
    state.kind === 'done'
      ? undefined
      : deletionMessage('restaurant', state, name);
  const retry = state.kind === 'unavailable';
  const checking = state.kind === 'unknown';
  const confirming = message === undefined;
  const close = () => dialogRef.current?.close();
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title={message?.title ?? deleteRestaurantTitle(name)}
      locked={deleting}
      onSubmit={(event) => {
        event.preventDefault();
        if (!deleting && (confirming || retry || checking)) void run();
      }}
      actions={
        confirming || retry ? (
          <>
            <Button variant="secondary" disabled={deleting} onClick={close}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={deleting}
              aria-busy={deleting ? true : undefined}
            >
              Удалить ресторан
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
            Ресторан станет недоступен всем участникам, все роли в нём снимутся.
            Восстановить ресторан нельзя.
          </Text>
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
