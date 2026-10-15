import { Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { Envelope, BusinessContext } from '@/application/api';
import type { ReadModel } from '@/application/read-model';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import { useRestaurantRead } from '@/presentation/session/hooks';
import { FormMessage } from '@/presentation/ui/form-message';
import { Button } from '@/presentation/ui/actions';
import { formatStamp } from '@/presentation/ui/zones';

const contextStamp = (context: BusinessContext) =>
  formatStamp(context.evaluatedAt.epochMs, context.settings.timeZone);

export const warehouseStamp = (context: BusinessContext | undefined) =>
  context === undefined
    ? 'Получаем данные…'
    : `Обновлено ${contextStamp(context)}`;

export function WarehouseRead<T>({
  model,
  title,
  section = 'Склад',
  children,
}: {
  model: ReadModel<Envelope<T>>;
  title: string;
  section?: string;
  children: (value: Envelope<T>) => ReactNode;
}) {
  const { snapshot, failure } = useRestaurantRead(model);
  if (snapshot.value === undefined) {
    if (failure !== undefined)
      return (
        <ReadFailure
          failure={failure}
          section={section}
          title={title}
          onRetry={() => {
            model.refresh();
          }}
        >
          Попробуйте ещё раз.
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
          title="Не удалось обновить данные"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                model.refresh();
              }}
            >
              Попробовать ещё раз
            </Button>
          }
        >
          Показаны данные на {contextStamp(snapshot.value.context)}.
        </FormMessage>
      )}
      {children(snapshot.value)}
    </Stack>
  );
}
