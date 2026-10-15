import { useRef, useState, type RefObject } from 'react';
import { orgKeys, type Refusal } from '@/application/organization-commands';
import { useServices } from '@/presentation/services';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { plural } from '@/presentation/ui/plural';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import { zoneLabel } from '@/presentation/ui/zones';
import { nameError, restaurantNameMessage } from './names';

export type RestaurantState =
  | { readonly kind: 'editing' }
  | { readonly kind: 'invalid' } // RS02
  | { readonly kind: 'sending' } // RS04
  | { readonly kind: 'unknown' } // RS06
  // Auth refused the name although the screen had checked it (D16).
  | { readonly kind: 'rejected' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'gone' }
  | {
      readonly kind: 'not-added';
      readonly seconds?: number;
      // The attempt was sent again and Auth says it did not complete.
      readonly checked?: boolean;
    };

// The state of the dialog after the answer to «Добавить» (checked: the answer
// to the same attempt sent again).
export function restaurantStateOf(
  refusal: Refusal,
  checked: boolean,
): RestaurantState {
  switch (refusal.kind) {
    case 'unknown':
      return { kind: 'unknown' };
    case 'invalid':
      return { kind: 'rejected' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'gone':
      return { kind: 'gone' };
    case 'limited':
      return { kind: 'not-added', seconds: refusal.seconds };
    case 'ended':
      return { kind: 'editing' };
    case 'conflict':
    case 'last-admin':
    case 'invited':
    case 'closed':
    case 'delivery':
    case 'unavailable':
      return checked ? { kind: 'not-added', checked } : { kind: 'not-added' };
  }
}

// Figma RS06 and the refusals of Auth; RS02 and RS04 live in the field and the
// button.
export function addRestaurantMessage(
  state: RestaurantState,
  name: string,
): { title: string; text: string } | undefined {
  switch (state.kind) {
    case 'unknown':
      return {
        title: 'Не знаем, добавлен ли ресторан',
        text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
      };
    case 'rejected':
      return {
        title: 'Ресторан не добавлен',
        text: `Проверьте название «${name.trim()}» и отправьте ещё раз.`,
      };
    case 'forbidden':
      return {
        title: 'Добавить ресторан нельзя',
        text: 'Добавлять рестораны может только администратор организации. Возможно, у вас больше нет этой роли — обновите страницу.',
      };
    case 'gone':
      return {
        title: 'Организация недоступна',
        text: 'Организацию удалили, или у вас больше нет к ней доступа. Вернитесь к списку организаций.',
      };
    case 'not-added':
      return {
        title: 'Ресторан не добавлен',
        text:
          state.seconds !== undefined
            ? `Слишком много попыток. Попробуйте через ${String(state.seconds)} ${plural(state.seconds, 'секунду', 'секунды', 'секунд')}. Название осталось в поле.`
            : state.checked
              ? 'Не получилось. Название осталось в поле — отправьте ещё раз.'
              : 'Не получилось. Попробуйте через пару минут. Название осталось в поле.',
      };
    case 'editing':
    case 'invalid':
    case 'sending':
      return undefined;
  }
}

// Figma RS01–RS06: the dialog stays open until Auth accepts the restaurant;
// then onAdded tells the page, which shows RS05 above the list. An unknown
// answer locks the field: the check sends the earlier attempt, not the input.
export function AddRestaurantDialog({
  dialogRef,
  orgID,
  timeZone,
  onAdded,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  orgID: string;
  timeZone: string;
  onAdded: (name: string) => void;
}) {
  const { organizations, now } = useServices();
  const { commands } = organizations;
  const key = orgKeys.addRestaurant(orgID);
  // An attempt without a known outcome keeps the name it was sent with.
  const [name, setName] = useState(
    () => commands.pendingRestaurantName(orgID) ?? '',
  );
  const [state, setState] = useState<RestaurantState>(() =>
    commands.isPending(key) ? { kind: 'unknown' } : { kind: 'editing' },
  );
  const input = useRef<HTMLInputElement>(null);
  const locked = state.kind === 'sending' || state.kind === 'unknown';
  const error = state.kind === 'invalid' ? nameError(name) : undefined;
  const message = addRestaurantMessage(state, name);

  const submit = async () => {
    const resending = commands.isPending(key);
    const sent = commands.pendingRestaurantName(orgID);
    if (!resending && nameError(name) !== undefined) {
      setState({ kind: 'invalid' });
      input.current?.focus();
      return;
    }
    setState({ kind: 'sending' });
    const added = sent ?? name.trim();
    const outcome = await commands.addRestaurant(orgID, added);
    if (outcome.kind === 'done') {
      dialogRef.current?.close();
      setName('');
      setState({ kind: 'editing' });
      onAdded(added);
      return;
    }
    setState(restaurantStateOf(outcome, resending));
  };

  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={480}
      title="Добавить ресторан"
      locked={state.kind === 'sending'}
      onSubmit={(event) => {
        event.preventDefault();
        if (state.kind !== 'sending') void submit();
      }}
      actions={
        <>
          <Button
            variant="secondary"
            disabled={state.kind === 'sending'}
            onClick={() => dialogRef.current?.close()}
          >
            {state.kind === 'unknown' ? 'Закрыть' : 'Отмена'}
          </Button>
          <Button
            type="submit"
            disabled={locked}
            aria-busy={state.kind === 'sending' ? true : undefined}
          >
            {state.kind === 'sending' ? 'Добавляем…' : 'Добавить'}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <FieldLabel htmlFor="restaurant-name">Название ресторана</FieldLabel>
        <TextInput
          ref={input}
          id="restaurant-name"
          name="restaurantName"
          placeholder="Например, На Ленина"
          value={name}
          disabled={locked}
          invalid={error !== undefined}
          aria-describedby="restaurant-name-hint"
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        <FieldMessage
          id="restaurant-name-hint"
          error={error && restaurantNameMessage(error)}
          hint={`Часовой пояс — как у организации: ${zoneLabel(timeZone, now())}.`}
        />
      </FieldGroup>
      {message &&
        (state.kind === 'unknown' ? (
          <UnknownOutcomeAlert
            title={message.title}
            onCheck={() => {
              void submit();
            }}
          >
            {message.text}
          </UnknownOutcomeAlert>
        ) : (
          <FormMessage tone="error" title={message.title}>
            {message.text}
          </FormMessage>
        ))}
    </ModalPanel>
  );
}
