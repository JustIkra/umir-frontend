import { Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { Envelope, BusinessContext } from '@/application/api';
import type { ReadModel } from '@/application/read-model';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import { useRestaurantRead } from '@/presentation/session/hooks';
import { FormMessage } from '@/presentation/ui/form-message';
import { Button } from '@/presentation/ui/actions';
import { formatStamp } from '@/presentation/ui/zones';

export const warehouseStamp = (context: BusinessContext | undefined) =>
  context === undefined
    ? 'Получаем данные…'
    : `Оценка ${formatStamp(context.evaluatedAt.epochMs, context.settings.timeZone)}`;

export function WarehouseRead<T>({
  model,
  title,
  children,
}: {
  model: ReadModel<Envelope<T>>;
  title: string;
  children: (value: Envelope<T>) => ReactNode;
}) {
  const { snapshot, failure } = useRestaurantRead(model);
  if (snapshot.value === undefined) {
    if (failure !== undefined)
      return (
        <ReadFailure
          failure={failure}
          section="Склад"
          title={title}
          onRetry={() => {
            model.refresh();
          }}
        >
          Данные сейчас недоступны. Это не означает, что список пуст.
        </ReadFailure>
      );
    return (
      <Text role="status" color="text.secondary">
        Получаем данные…
      </Text>
    );
  }
  return (
    <Stack gap="3">
      {failure !== undefined && (
        <FormMessage
          tone="error"
          title="Данные не обновлены"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                model.refresh();
              }}
            >
              Повторить чтение
            </Button>
          }
        >
          Показана предыдущая оценка. {warehouseStamp(snapshot.value.context)}.
        </FormMessage>
      )}
      {children(snapshot.value)}
    </Stack>
  );
}
