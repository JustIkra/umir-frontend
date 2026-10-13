import { Text } from '@chakra-ui/react';
import type { RefObject } from 'react';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';

// Figma CX01. «Не отменять» comes first and gets the initial focus; both
// buttons only close the dialog.
export function CancelInvitationDialog({
  dialogRef,
  email,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  email: string;
}) {
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title="Отменить приглашение?"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Не отменять
          </Button>
          <Button type="submit">Отменить приглашение</Button>
        </>
      }
    >
      <Text textStyle="body.default">
        {`Приглашение для ${email} будет отменено. Ссылка из письма перестанет действовать. Учётные записи и назначения участников не меняются.`}
      </Text>
    </ModalPanel>
  );
}
