import type { FollowedOperation } from '@/application/lifecycles';
import type { Outcome } from '@/application/organization-commands';
import type { Lifecycle } from '@/application/organizations';

// What the dialogs of «Удалить ресторан» and «Удалить организацию» and the
// rows that check an unsettled deletion say. Neither has a Figma frame.

export type DeletionSubject = 'restaurant' | 'organization';

export type DeletionState =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'unknown' }
  // The restaurant or organization is already gone (ScopeDeleted, NotFound).
  | { readonly kind: 'gone' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'unavailable' };

// The answer of Auth to a deletion: 'done' leaves the dialog, a refusal is a
// state of it.
export function deletionOutcomeState(
  outcome: Outcome<Lifecycle>,
): DeletionState | { readonly kind: 'done' } {
  switch (outcome.kind) {
    case 'done':
      return { kind: 'done' };
    case 'gone':
      return { kind: 'gone' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'unknown':
      return { kind: 'unknown' };
    case 'ended':
      return { kind: 'confirm' };
    case 'invalid':
    case 'conflict':
    case 'last-admin':
    case 'invited':
    case 'closed':
    case 'limited':
    case 'delivery':
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}

export interface DeletionMessage {
  readonly title: string;
  readonly text: string;
}

// The confirmation and the progress have their own copy in the dialog.
export function deletionMessage(
  subject: DeletionSubject,
  state: DeletionState,
  name: string,
): DeletionMessage | undefined {
  const restaurant = subject === 'restaurant';
  const notDeleted = restaurant
    ? 'Ресторан не удалён'
    : 'Организация не удалена';
  switch (state.kind) {
    case 'confirm':
    case 'deleting':
      return undefined;
    case 'unknown':
      return {
        title: restaurant
          ? 'Не знаем, удалён ли ресторан'
          : 'Не знаем, удалена ли организация',
        text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
      };
    case 'gone':
      return {
        title: restaurant ? 'Ресторан уже удалён' : 'Организация уже удалена',
        text: restaurant
          ? `Ресторан «${name}» уже удалили — например, в другой вкладке.`
          : `Организацию «${name}» уже удалили — например, в другой вкладке.`,
      };
    case 'forbidden':
      return {
        title: notDeleted,
        text: restaurant
          ? 'Удалять рестораны может только администратор организации. Возможно, у вас больше нет этой роли — обновите страницу.'
          : 'Удалить организацию может только её администратор. Возможно, у вас больше нет этой роли — обновите страницу.',
      };
    case 'unavailable':
      return {
        title: notDeleted,
        text: 'Не получилось. Попробуйте через пару минут.',
      };
  }
}

// The button of «Удалить организацию» works for the exact name only.
export function canConfirmDeletion(input: string, name: string): boolean {
  return name.length > 0 && input.trim() === name;
}

export const restaurantDeletingTitle = (name: string) =>
  `Удаляем ресторан «${name}». Это займёт немного времени.`;

// The notice over the list of organizations while Auth deletes one (or after
// it did). A deletion that can no longer be read (the right to read it went
// with the organization) is a deleted one.
export function organizationDeletionNotice(
  operation: FollowedOperation,
): DeletionMessage | undefined {
  if (operation.kind !== 'delete-organization') return undefined;
  switch (operation.status) {
    case 'following':
    case 'stalled':
      return {
        title: `Удаляем организацию «${operation.name}»`,
        text: 'Доступ к ней уже закрыт. Это займёт немного времени.',
      };
    case 'finished':
      return {
        title: `Организация «${operation.name}» удалена`,
        text: 'Все её данные удалены. Аккаунты участников остались.',
      };
    // The operation can no longer be read: whether the data is cleaned is
    // not known.
    case 'lost':
      return {
        title: `Организация «${operation.name}» удалена`,
        text: 'Доступ к ней закрыт. Аккаунты участников остались.',
      };
  }
}
