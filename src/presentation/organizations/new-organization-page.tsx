import { Box, Flex } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import type { FollowedOperation } from '@/application/lifecycles';
import { orgKeys, type Refusal } from '@/application/organization-commands';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useServices } from '@/presentation/services';
import { useStore } from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { limitReachedText } from '@/presentation/ui/attempt-messages';
import { Card, CardForm } from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { plural } from '@/presentation/ui/plural';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import {
  nameError,
  organizationNameMessage,
  restaurantNameMessage,
} from './names';
import { OrganizationLayout } from './organization-layout';
import { ReadinessSteps } from './readiness-steps';
import { TimezoneField, zoneUnsupported } from './timezone-field';

export type CreationState =
  | { readonly kind: 'editing' }
  // NE02. rejected: the fields are right, Auth refused the data all the same.
  | { readonly kind: 'invalid'; readonly rejected?: boolean }
  | { readonly kind: 'sending' } // NE04
  | { readonly kind: 'preparing'; readonly operationID: string } // NE05
  | { readonly kind: 'ready'; readonly restaurantID: string } // NE06
  | { readonly kind: 'stalled'; readonly operationID: string } // NE09
  | { readonly kind: 'unknown' } // NE07
  // NE10 (checked: false) and NE08 (checked: true, the attempt was sent again
  // and did not complete); seconds: Auth asks to wait.
  | {
      readonly kind: 'not-created';
      readonly checked?: boolean;
      readonly seconds?: number;
      // The quota of Auth is used up (LimitExceeded).
      readonly limit?: boolean;
    }
  | { readonly kind: 'forbidden' } // NE11
  // The organization was created, but its preparation can no longer be read.
  // The form never opens again: another submit would create a second one.
  | { readonly kind: 'untracked' }
  | { readonly kind: 'zone' }; // TZ09

export type CreationTone = 'error' | 'unknown' | 'info' | 'success';

const notCreated = 'Организация не создана';

export function creationTone(state: CreationState): CreationTone {
  switch (state.kind) {
    case 'unknown':
      return 'unknown';
    case 'preparing':
      return 'info';
    case 'ready':
      return 'success';
    case 'untracked':
      return 'unknown';
    case 'editing':
    case 'invalid':
    case 'sending':
    case 'stalled':
    case 'not-created':
    case 'forbidden':
    case 'zone':
      return 'error';
  }
}

// What the frames NE02–NE11 say. The editing and sending states have no
// message: the form and its button show them.
export function creationMessage(
  state: CreationState,
  name: string,
): { title: string; text: string } | undefined {
  switch (state.kind) {
    case 'invalid':
      return {
        title: notCreated,
        text: state.rejected
          ? 'Проверьте названия и отправьте ещё раз.'
          : 'Проверьте отмеченные поля.',
      };
    case 'preparing':
      return {
        title: 'Настраиваем ресторан',
        text: 'Обычно это занимает до минуты. Страницу обновлять не нужно.',
      };
    case 'ready':
      return {
        title: `Организация «${name}» готова к работе`,
        text: 'Организация создана, ресторан настроен.',
      };
    case 'stalled':
      return {
        title: 'Ресторан не настроился',
        text: 'Организация создана. Нажмите «Попробовать снова» — организация не задвоится.',
      };
    case 'unknown':
      return {
        title: 'Не знаем, создана ли организация',
        text: 'Связь прервалась. Нажмите «Проверить результат» — организация не задвоится.',
      };
    case 'not-created':
      return {
        title: notCreated,
        text:
          state.limit === true
            ? limitReachedText
            : state.seconds !== undefined
              ? `Слишком много попыток. Попробуйте через ${String(state.seconds)} ${plural(state.seconds, 'секунду', 'секунды', 'секунд')}. Данные остались в форме.`
              : state.checked
                ? 'Не получилось. Данные остались в форме — отправьте ещё раз.'
                : 'Не получилось. Попробуйте через пару минут. Данные остались в форме.',
      };
    case 'forbidden':
      return {
        title: 'Создать организацию нельзя',
        text: 'Вам пока нельзя создавать организации. Попросите администратора прислать приглашение.',
      };
    case 'untracked':
      return {
        title: 'Не знаем, готов ли ресторан',
        text: 'Организация создана. Откройте список организаций, чтобы проверить.',
      };
    case 'zone':
      return { title: notCreated, text: zoneUnsupported };
    case 'editing':
    case 'sending':
      return undefined;
  }
}

// The state after the answer to «Создать организацию» (checked: the answer to
// the same attempt sent again). A refusal Auth gives without a screen of its
// own means the same as no answer: nothing was created, the form stays.
export function refusalState(
  refusal: Refusal,
  checked: boolean,
): CreationState {
  switch (refusal.kind) {
    case 'unknown':
      return { kind: 'unknown' };
    case 'invalid':
      return refusal.code === 'UnknownTimeZone'
        ? { kind: 'zone' }
        : { kind: 'invalid', rejected: true };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'limited':
      return { kind: 'not-created', seconds: refusal.seconds };
    case 'ended':
      return { kind: 'editing' };
    case 'conflict':
    case 'last-admin':
    case 'invited':
    case 'closed':
    case 'gone':
    case 'delivery':
      return checked
        ? { kind: 'not-created', checked }
        : { kind: 'not-created' };
    case 'unavailable':
      if (refusal.code === 'LimitExceeded') {
        return { kind: 'not-created', limit: true };
      }
      return checked
        ? { kind: 'not-created', checked }
        : { kind: 'not-created' };
  }
}

// The preparation after the answer is what the tracker has seen last: ready
// when the restaurant is, stalled when it stopped waiting, untracked when the
// organization can no longer be read (it exists all the same).
export function followedCreation(
  state: CreationState,
  operations: readonly FollowedOperation[],
): CreationState {
  if (state.kind !== 'preparing') return state;
  const operation = operations.find(
    (item) => item.operationID === state.operationID,
  );
  switch (operation?.status) {
    case 'finished': {
      const restaurantID = operation.lifecycle.restaurantIDs[0];
      return restaurantID === undefined
        ? state
        : { kind: 'ready', restaurantID };
    }
    case 'stalled':
      return { kind: 'stalled', operationID: state.operationID };
    case 'lost':
      return { kind: 'untracked' };
    case 'following':
    case undefined:
      return state;
  }
}

const defaultZone = 'Europe/Moscow';

// Figma NE01–NE12. «Создать организацию» sends one command; the preparation
// of the first restaurant is followed by the tracker that the command started.
export function NewOrganizationPage() {
  const { organizations } = useServices();
  const { commands, lifecycles } = organizations;
  const key = orgKeys.createOrganization;
  const operations = useStore(lifecycles);
  // An attempt without a known outcome keeps the input it was sent with.
  const [pending] = useState(() => commands.pendingOrganization());
  const [organizationName, setOrganizationName] = useState(pending?.name ?? '');
  const [restaurantName, setRestaurantName] = useState(
    pending?.firstRestaurantName ?? '',
  );
  const [timeZone, setTimeZone] = useState(pending?.timeZone ?? defaultZone);
  const [stored, setStored] = useState<CreationState>(() =>
    commands.isPending(key) ? { kind: 'unknown' } : { kind: 'editing' },
  );
  const state = followedCreation(stored, operations);
  const messageBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stored.kind === 'invalid' && !stored.rejected) {
      messageBox.current?.focus();
    }
  }, [stored]);

  const submit = async () => {
    const resending = commands.isPending(key);
    if (
      !resending &&
      (nameError(organizationName) !== undefined ||
        nameError(restaurantName) !== undefined)
    ) {
      setStored({ kind: 'invalid' });
      return;
    }
    setStored({ kind: 'sending' });
    const outcome = await commands.createOrganization({
      name: organizationName.trim(),
      timeZone,
      firstRestaurantName: restaurantName.trim(),
    });
    setStored(
      outcome.kind === 'done'
        ? { kind: 'preparing', operationID: outcome.value.operationID }
        : refusalState(outcome, resending),
    );
  };

  const created =
    stored.kind === 'preparing'
      ? operations.find((item) => item.operationID === stored.operationID)
      : undefined;
  const message = creationMessage(
    state,
    created?.name ?? organizationName.trim(),
  );
  const tone = creationTone(state);
  const header = (
    <PageHeader
      title="Создать организацию"
      caption="Организация объединяет ваши рестораны. Первый ресторан создадим вместе с ней."
    />
  );

  if (state.kind === 'untracked' && message) {
    return (
      <OrganizationLayout header={header}>
        <Card>
          <FormMessage
            tone={tone}
            title={message.title}
            action={
              <ButtonLink variant="secondary" to="/app/organizations">
                Все организации
              </ButtonLink>
            }
          >
            {message.text}
          </FormMessage>
        </Card>
      </OrganizationLayout>
    );
  }

  if (
    state.kind === 'preparing' ||
    state.kind === 'stalled' ||
    state.kind === 'ready'
  ) {
    return (
      <OrganizationLayout header={header}>
        <Card>
          <ReadinessSteps stage={state.kind} />
          {message && (
            <FormMessage
              tone={tone}
              title={message.title}
              action={
                state.kind === 'ready' ? (
                  <ButtonLink to={`/app/r/${state.restaurantID}`}>
                    Перейти к работе
                  </ButtonLink>
                ) : state.kind === 'stalled' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      lifecycles.retry(state.operationID);
                    }}
                  >
                    Попробовать снова
                  </Button>
                ) : undefined
              }
            >
              {message.text}
            </FormMessage>
          )}
        </Card>
      </OrganizationLayout>
    );
  }

  const locked =
    state.kind === 'sending' ||
    state.kind === 'unknown' ||
    commands.isPending(key);
  const checking = state.kind === 'invalid' && !state.rejected;
  const organizationError = checking ? nameError(organizationName) : undefined;
  const restaurantError = checking ? nameError(restaurantName) : undefined;
  return (
    <OrganizationLayout header={header}>
      <CardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked) void submit();
        }}
      >
        {message && (
          <Box ref={messageBox} tabIndex={-1} outline="none">
            {state.kind === 'unknown' ? (
              <UnknownOutcomeAlert
                title={message.title}
                onCheck={() => {
                  void submit();
                }}
              >
                {message.text}
              </UnknownOutcomeAlert>
            ) : (
              <FormMessage
                tone={tone}
                title={message.title}
                action={
                  state.kind === 'not-created' && state.checked ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void submit();
                      }}
                    >
                      Отправить ещё раз
                    </Button>
                  ) : undefined
                }
              >
                {message.text}
              </FormMessage>
            )}
          </Box>
        )}
        <FieldGroup>
          <FieldLabel htmlFor="organization-name">
            Название организации
          </FieldLabel>
          <TextInput
            id="organization-name"
            name="organizationName"
            autoComplete="organization"
            placeholder="Например, Северная кухня"
            value={organizationName}
            disabled={locked}
            invalid={organizationError !== undefined}
            aria-describedby="organization-name-hint"
            onChange={(event) => {
              setOrganizationName(event.currentTarget.value);
            }}
          />
          <FieldMessage
            id="organization-name-hint"
            error={
              organizationError && organizationNameMessage(organizationError)
            }
            hint="Его увидят в меню и в письмах с приглашением."
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="first-restaurant">
            Название первого ресторана
          </FieldLabel>
          <TextInput
            id="first-restaurant"
            name="restaurantName"
            placeholder="Например, На Невском"
            value={restaurantName}
            disabled={locked}
            invalid={restaurantError !== undefined}
            aria-describedby="first-restaurant-hint"
            onChange={(event) => {
              setRestaurantName(event.currentTarget.value);
            }}
          />
          <FieldMessage
            id="first-restaurant-hint"
            error={restaurantError && restaurantNameMessage(restaurantError)}
          />
        </FieldGroup>
        <TimezoneField
          id="new-organization-zone"
          hint="По нему показываем даты и сроки во всех ресторанах организации."
          value={timeZone}
          disabled={locked}
          error={state.kind === 'zone' ? zoneUnsupported : undefined}
          onChange={(next) => {
            setTimeZone(next);
            if (stored.kind === 'zone') setStored({ kind: 'editing' });
          }}
        />
        <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
          <Button
            type="submit"
            disabled={locked}
            aria-busy={state.kind === 'sending' ? true : undefined}
          >
            {state.kind === 'sending' ? 'Создаём…' : 'Создать организацию'}
          </Button>
          <ButtonLink variant="secondary" to="/app/organizations">
            Отмена
          </ButtonLink>
        </Flex>
      </CardForm>
    </OrganizationLayout>
  );
}
