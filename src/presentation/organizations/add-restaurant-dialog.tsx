import type { RefObject } from 'react';
import { useServices } from '@/presentation/services';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { zoneLine } from './format';

// Figma RS01. «Добавить» only closes the dialog: nothing is created yet.
export function AddRestaurantDialog({
  dialogRef,
  timeZone,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  timeZone: string;
}) {
  const { now } = useServices();
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={480}
      title="Добавить ресторан"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Отмена
          </Button>
          <Button type="submit">Добавить</Button>
        </>
      }
    >
      <FieldGroup>
        <FieldLabel htmlFor="restaurant-name">Название ресторана</FieldLabel>
        <TextInput
          id="restaurant-name"
          name="restaurantName"
          placeholder="Например, На Ленина"
          aria-describedby="restaurant-name-hint"
        />
        <FieldMessage
          id="restaurant-name-hint"
          hint={`Часовой пояс — как у организации: ${zoneLine(timeZone, now())}.`}
        />
      </FieldGroup>
    </ModalPanel>
  );
}
