import { useEffect } from 'react';
import type { ReadModel } from '@/application/read-model';
import { Button } from '@/presentation/ui/actions';

// The Auth lists are not pushed (D11): a view opened over a model that was
// read before reads it again. A model that is loading right now was just
// started by the first subscriber and is not read twice.
export function refreshWhenOpened(model: ReadModel<unknown>): void {
  if (!model.getSnapshot().loading) model.refresh();
}

export function useRefreshOnOpen(model: ReadModel<unknown>): void {
  useEffect(() => {
    refreshWhenOpened(model);
  }, [model]);
}

// «Обновить»: the same read as the one on opening.
export function RefreshButton({
  model,
  loading,
}: {
  model: ReadModel<unknown>;
  loading: boolean;
}) {
  return (
    <Button
      variant="link"
      alignSelf="flex-start"
      aria-busy={loading}
      disabled={loading}
      onClick={() => {
        model.refresh();
      }}
    >
      Обновить
    </Button>
  );
}
