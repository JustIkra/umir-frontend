import type { RestaurantAccess } from './access';
import type { Attempt } from './commands';
import { canOpenSection, type SectionKey } from '@/domain/access';

export interface SwitchTarget {
  readonly restaurantID: string;
  readonly section: SectionKey;
  // W12: the section the new restaurant lacks; the overview opens instead.
  readonly missing: SectionKey | undefined;
}

export type SwitchDecision =
  | { readonly kind: 'go'; readonly to: SwitchTarget }
  | {
      readonly kind: 'confirm-unsaved';
      readonly form: string;
      readonly to: SwitchTarget;
    }
  | { readonly kind: 'blocked-unknown'; readonly attempt: Attempt };

// The restaurant switcher (W09–W12). An attempt of the current restaurant
// with an unknown outcome blocks the switch until it is checked; an unsent
// form asks first. Outside a restaurant (currentID undefined) no attempt
// blocks: account attempts have no restaurant either.
export function decideSwitch({
  target,
  section,
  currentID,
  attempts,
  unsavedForm,
}: {
  readonly target: RestaurantAccess;
  readonly section: SectionKey;
  readonly currentID: string | undefined;
  readonly attempts: readonly Attempt[];
  readonly unsavedForm: string | undefined;
}): SwitchDecision {
  const unknown = attempts.find(
    (attempt) => currentID !== undefined && attempt.restaurantID === currentID,
  );
  if (unknown) return { kind: 'blocked-unknown', attempt: unknown };
  const allowed = canOpenSection(section, target.permissions);
  const to: SwitchTarget = {
    restaurantID: target.restaurantID,
    section: allowed ? section : 'overview',
    missing: allowed ? undefined : section,
  };
  return unsavedForm === undefined
    ? { kind: 'go', to }
    : { kind: 'confirm-unsaved', form: unsavedForm, to };
}
