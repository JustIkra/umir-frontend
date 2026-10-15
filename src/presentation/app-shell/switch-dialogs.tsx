import { Text } from '@chakra-ui/react';
import type { RefObject } from 'react';
import type { Attempt } from '@/application/commands';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { formatInstant } from '@/presentation/ui/time';

// Figma W10. «Остаться» comes first: it gets the initial focus and is on top
// on 390; from 768 it moves to the right.
export function UnsavedFormDialog({
  dialogRef,
  form,
  restaurantName,
  onLeave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  form: string;
  restaurantName: string;
  onLeave: () => void;
}) {
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title="Перейти в другой ресторан?"
      actions={
        <>
          <Button type="submit" order={{ sm: 1 }}>
            Остаться
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              dialogRef.current?.close();
              onLeave();
            }}
          >
            Перейти без сохранения
          </Button>
        </>
      }
    >
      <Text textStyle="body.default">
        {`${form} в ресторане «${restaurantName}» не сохранена. Если перейти, введённое пропадёт.`}
      </Text>
    </ModalPanel>
  );
}

// Figma W11: the switch waits until the attempt is checked.
export function UnknownAttemptDialog({
  dialogRef,
  attempt,
  restaurantName,
  timeZone,
  onCheck,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  attempt: Attempt;
  restaurantName: string;
  timeZone: string;
  onCheck: () => void;
}) {
  const time = formatInstant(attempt.startedAt, timeZone, 'time');
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title="Сначала проверьте последнее действие"
      actions={
        <>
          <Button
            order={{ sm: 1 }}
            onClick={() => {
              dialogRef.current?.close();
              onCheck();
            }}
          >
            Проверить результат
          </Button>
          <Button type="submit" variant="secondary">
            Закрыть
          </Button>
        </>
      }
    >
      <Text textStyle="body.default">
        {`Связь прервалась во время ${attempt.label} (${time}) в ресторане «${restaurantName}». Проверьте результат — после этого можно перейти в другой ресторан.`}
      </Text>
    </ModalPanel>
  );
}
