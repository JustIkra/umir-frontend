import { Flex, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { WriteoffOutcome } from '@/application/writeoff-commands';
import { useServices } from '@/presentation/services';
import {
  usePermissions,
  useReadModel,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { ListCard } from '@/presentation/ui/card';
import { ModalPanel } from '@/presentation/ui/dialog';
import { FormMessage } from '@/presentation/ui/form-message';
import {
  dialogText,
  dialogTitle,
  checkAction,
  keepsDialog,
  locksDialog,
  pendingRows,
  pendingTitle,
  settlesDialog,
  unknownMessage,
  writeoffMessage,
  type PendingRowView,
  type WriteoffMessage,
} from './writeoff-messages';

export type WriteoffStep = 'confirm' | 'sending' | 'unknown' | 'checking';

// The confirmation of one batch (new frames, spec 6.3), on ModalPanel: the
// safe button comes first and gets the focus; from 768 it moves to the
// right. While sending or checking both buttons are closed.
export function WriteoffDialog({
  dialogRef,
  row,
  step,
  notice,
  onConfirm,
  onCheck,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  row: PendingRowView;
  step: WriteoffStep;
  notice: WriteoffMessage | undefined;
  onConfirm: () => void;
  onCheck: () => void;
  onClosed: () => void;
}) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener('close', onClosed);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('close', onClosed);
    };
  }, [dialogRef, onClosed]);
  const unknown = step === 'unknown' || step === 'checking';
  const busy = step === 'sending' || step === 'checking';
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      locked={locksDialog(step)}
      title={dialogTitle(row.batchID)}
      actions={
        <>
          <Button
            type="submit"
            variant="secondary"
            order={{ sm: 1 }}
            disabled={busy}
          >
            {unknown ? 'Закрыть' : 'Отмена'}
          </Button>
          <Button
            disabled={busy}
            aria-busy={busy ? 'true' : undefined}
            onClick={unknown ? onCheck : onConfirm}
          >
            {unknown
              ? 'Проверить результат'
              : step === 'sending'
                ? 'Списываем…'
                : 'Списать партию'}
          </Button>
        </>
      }
    >
      <Text textStyle="body.default">{dialogText(row)}</Text>
      {unknown && (
        <FormMessage tone="unknown" title={unknownMessage.title}>
          {unknownMessage.text}
        </FormMessage>
      )}
      {notice !== undefined && (
        <FormMessage tone={notice.tone} title={notice.title}>
          {notice.text}
        </FormMessage>
      )}
    </ModalPanel>
  );
}

// Spec 6.2: «Ожидают списания» under the list of the window. Confirming is
// one command per batch; an unknown outcome stays open in the tab, so the
// dialog of that batch opens on «Проверить результат».
export function WriteoffPanel() {
  const { access, writeoffCommands } = useServices();
  const data = useRestaurantData();
  const model = data.pendingWriteoffs();
  const { snapshot, failure } = useRestaurantRead(model);
  const catalog = useReadModel(data.products()).value?.result.items ?? [];
  const canConfirm = usePermissions().has('writeoff.confirm');
  const commands = writeoffCommands(data.restaurantID);
  const [target, setTarget] = useState<PendingRowView>();
  const [step, setStep] = useState<WriteoffStep>('confirm');
  const [notice, setNotice] = useState<WriteoffMessage>();
  const [message, setMessage] = useState<WriteoffMessage>();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const targetBatch = useRef<string>(undefined);
  const closed = useCallback(() => {
    targetBatch.current = undefined;
    setTarget(undefined);
  }, []);
  const value = snapshot.value;
  const timeZone = value?.context.settings.timeZone ?? 'UTC';
  const products = new Map(
    catalog.map((product) => [product.productID, product]),
  );
  const rows =
    value === undefined
      ? undefined
      : pendingRows(value.result, products, timeZone);
  const settle = (batchID: string, outcome: WriteoffOutcome) => {
    if (outcome.kind === 'refused' && outcome.code === 'Forbidden')
      void access.refresh();
    if (!settlesDialog(targetBatch.current, batchID)) {
      setMessage(writeoffMessage(outcome, batchID, timeZone));
      return;
    }
    if (keepsDialog(outcome)) {
      setStep('unknown');
      setNotice(
        outcome.kind === 'check-failed'
          ? writeoffMessage(outcome, batchID, timeZone)
          : undefined,
      );
      return;
    }
    setMessage(writeoffMessage(outcome, batchID, timeZone));
    dialog.current?.close();
  };
  const confirm = async (batchID: string) => {
    setStep('sending');
    settle(batchID, await commands.confirm(batchID));
  };
  const check = async (batchID: string) => {
    if (checkAction(commands.pending(batchID)) === 'refresh') {
      dialog.current?.close();
      model.refresh();
      return;
    }
    setStep('checking');
    setNotice(undefined);
    settle(batchID, await commands.check(batchID));
  };
  const open = (row: PendingRowView) => {
    setMessage(undefined);
    setNotice(undefined);
    setStep(commands.pending(row.batchID) ? 'unknown' : 'confirm');
    targetBatch.current = row.batchID;
    setTarget(row);
  };
  return (
    <Stack as="section" aria-labelledby={headingId} gap="3">
      {message !== undefined && (
        <FormMessage tone={message.tone} title={message.title}>
          {message.text}
        </FormMessage>
      )}
      <Stack gap="1">
        <chakra.h2 id={headingId} textStyle="heading.h3">
          {pendingTitle(rows?.length)}
        </chakra.h2>
        <Text textStyle="body.default" color="text.secondary">
          Срок годности истёк. Партии не используются в заказах и остаются на
          складе до подтверждения списания.
        </Text>
      </Stack>
      {failure !== undefined && (
        <FormMessage
          tone="error"
          title="Не удалось получить партии под списание"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                model.refresh();
              }}
            >
              Повторить
            </Button>
          }
        />
      )}
      {rows === undefined && failure === undefined && (
        <Stack gap="2" aria-hidden="true">
          <Skeleton h="5" w="60%" />
          <Skeleton h="5" w="40%" />
        </Stack>
      )}
      {rows?.length === 0 && (
        <Text textStyle="body.default" color="text.secondary">
          Партий, ожидающих списания, нет.
        </Text>
      )}
      {rows !== undefined && rows.length > 0 && (
        <ListCard p="0" overflow="hidden">
          {rows.map((row, index) => (
            <Flex
              as="li"
              key={row.batchID}
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'stretch', sm: 'center' }}
              justify="space-between"
              gap={{ base: '2', sm: '4' }}
              px="4"
              py="3"
              borderTopWidth={index === 0 ? '0' : '1px'}
              borderColor="border.default"
            >
              <Stack gap="0.5" minW="0">
                <Text textStyle="body.strong">{row.product}</Text>
                <Text textStyle="caption.default" color="text.secondary">
                  {`Партия ${row.batchID} · остаток ${row.quantity}`}
                </Text>
                <Text textStyle="caption.default" color="text.secondary">
                  {row.expired}
                </Text>
              </Stack>
              {canConfirm && (
                <Button
                  variant="secondary"
                  flexShrink="0"
                  alignSelf={{ base: 'flex-start', sm: 'center' }}
                  onClick={() => {
                    open(row);
                  }}
                >
                  Подтвердить списание
                </Button>
              )}
            </Flex>
          ))}
        </ListCard>
      )}
      {target !== undefined && (
        <WriteoffDialog
          dialogRef={dialog}
          row={target}
          step={step}
          notice={notice}
          onConfirm={() => {
            void confirm(target.batchID);
          }}
          onCheck={() => {
            void check(target.batchID);
          }}
          onClosed={closed}
        />
      )}
    </Stack>
  );
}
