import { useCallback, useState } from 'react';
import type { RestaurantAccess } from '@/application/access';
import type { Outcome } from '@/application/organization-commands';
import type { Lifecycle } from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { deletionOutcomeState, type DeletionState } from './deletion';

export type DeletionProgress = DeletionState | { readonly kind: 'done' };

// One place that sends a deletion and keeps what the screen shows of it. The
// command remembers an attempt without a known outcome, so calling run again
// after 'unknown' checks that attempt instead of sending a new one.
export function useDeletion({
  execute,
  onDone,
  onGone,
}: {
  execute: () => Promise<Outcome<Lifecycle>>;
  onDone: () => void;
  // The thing was already deleted: what the screen shows must be read again.
  onGone: () => void;
}) {
  const [stored, setStored] = useState<DeletionProgress>({ kind: 'confirm' });
  const run = async () => {
    setStored({ kind: 'deleting' });
    const outcome = await execute();
    const next = deletionOutcomeState(outcome);
    if (next.kind === 'gone') onGone();
    setStored(next);
    if (next.kind === 'done') onDone();
  };
  // Closing the dialog starts the next opening from the confirmation, unless
  // the command is on its way.
  const reset = useCallback(() => {
    setStored((state) =>
      state.kind === 'deleting' || state.kind === 'done'
        ? state
        : { kind: 'confirm' },
    );
  }, []);
  return { stored, run, reset };
}

// The deletion of a restaurant: the name of the row is what the command is
// told, and the tracker of the lifecycle follows the operation.
export function useRestaurantDeletion(
  restaurant: RestaurantAccess,
  onDeleted: (name: string) => void,
) {
  const { access, organizations } = useServices();
  const { orgID, restaurantID, name } = restaurant;
  return useDeletion({
    execute: () =>
      organizations.commands.deleteRestaurant(orgID, restaurantID, name),
    onDone: () => {
      onDeleted(name);
    },
    // The restaurant is not in the list any more: access is read again.
    onGone: () => {
      void access.refresh();
    },
  });
}

// The deletion of an organization: the name is the one the page reads.
export function useOrganizationDeletion(
  orgID: string,
  name: string,
  onDeleted: () => void,
) {
  const { access, organizations } = useServices();
  return useDeletion({
    execute: () => organizations.commands.deleteOrganization(orgID, name),
    onDone: onDeleted,
    // The organization is not in the list any more: access is read again.
    onGone: () => {
      void access.refresh();
    },
  });
}
