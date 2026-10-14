import { Box, Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import type { User } from '@/application/account';
import type {
  PasswordField,
  PendingChanges,
  PasswordFieldError,
  RenameCheck,
} from '@/application/account-settings';
import lockIcon from '@/presentation/assets/icons/lock-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { useServices } from '@/presentation/services';
import { useSession } from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { secondsLeft, useNow } from '@/presentation/ui/countdown';
import { ModalPanel } from '@/presentation/ui/dialog';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  ReadOnlyValue,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import { PageHeader } from './pages';

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack
      as="section"
      gap="5"
      p="6"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
    >
      <HStack gap="2">
        <Icon src={icon} size={24} />
        <chakra.h2 textStyle="heading.h3">{title}</chakra.h2>
      </HStack>
      {children}
    </Stack>
  );
}

export type NameStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'storage'; readonly code: string }
  | { readonly kind: 'checking' }
  | { readonly kind: 'unchanged'; readonly serverName: string }
  | { readonly kind: 'unconfirmed'; readonly code: string }
  | { readonly kind: 'recovering'; readonly code: string };

export type PasswordStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | {
      readonly kind: 'invalid';
      readonly errors: Readonly<
        Partial<Record<PasswordField, PasswordFieldError>>
      >;
    }
  | { readonly kind: 'limited'; readonly untilMs: number }
  | { readonly kind: 'storage'; readonly code: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'recovering'; readonly code: string }
  | { readonly kind: 'checking' }
  | { readonly kind: 'unchanged' };

type MessageAction =
  'check-name' | 'refresh-profile' | 'sign-in-to-check' | 'check-password';

export interface SettingsMessage {
  readonly tone: 'error' | 'unknown' | 'info';
  readonly title: string;
  readonly text: string;
  readonly action?: { readonly kind: MessageAction; readonly label: string };
  readonly details?: string;
}

export function emailNote(email: string | undefined): string {
  return email === undefined
    ? 'Без почты пароль не восстановить. Обратитесь к администратору организации.'
    : 'Сюда приходит код для восстановления пароля.';
}

// Figma S06–S10.
export function nameMessage(
  status: NameStatus,
  confirmed: string,
): SettingsMessage | undefined {
  switch (status.kind) {
    case 'storage':
      return {
        tone: 'error',
        title: 'Сервис учётных записей недоступен',
        text: `Имя не подтверждено. Показано последнее подтверждённое имя — «${confirmed}». Черновик остался в поле.`,
        action: { kind: 'check-name', label: 'Обновить данные профиля' },
        details: status.code,
      };
    case 'checking':
      return {
        tone: 'unknown',
        title: 'Проверяем, сохранилось ли имя',
        text: 'Ответ на сохранение не получен. Читаем данные профиля — имя повторно не отправляется.',
      };
    case 'unchanged':
      return {
        tone: 'info',
        title: 'Имя не изменилось',
        text: `Сервер вернул прежнее имя — «${status.serverName}». Черновик остался в поле: сохраните его ещё раз, если нужно.`,
      };
    case 'unconfirmed':
      return {
        tone: 'unknown',
        title: 'Результат сохранения неизвестен',
        text: `Не удалось прочитать данные профиля. Показано последнее подтверждённое имя — «${confirmed}».`,
        action: { kind: 'check-name', label: 'Повторить чтение профиля' },
      };
    case 'recovering':
      return {
        tone: 'unknown',
        title: 'Учётная запись временно недоступна',
        text: `Изменение имени ещё не подтверждено. Показано последнее подтверждённое имя — «${confirmed}».`,
        action: {
          kind: 'check-name',
          label: 'Проверить доступность учётной записи',
        },
        details: status.code,
      };
    case 'idle':
    case 'invalid':
    case 'saving':
      return undefined;
  }
}

// After a profile read. S06 and S10 stay when the read fails: the first is a
// definite refusal, the second waits for Auth to recover.
export function nameAfterCheck(
  previous: NameStatus,
  check: RenameCheck,
): NameStatus | 'saved' {
  switch (check.kind) {
    case 'saved':
      return 'saved';
    case 'unchanged':
      return { kind: 'unchanged', serverName: check.user.displayName };
    case 'unreadable':
      return previous.kind === 'recovering' || previous.kind === 'storage'
        ? previous
        : { kind: 'unconfirmed', code: check.code };
  }
}

export const passwordFieldText: Record<PasswordFieldError, string> = {
  'current-required': 'Введите текущий пароль',
  'current-wrong': 'Текущий пароль указан неверно.',
  'new-length': 'Нужно от 8 до 32 символов.',
  'new-rejected': 'Пароль должен содержать от 8 до 32 символов.',
  mismatch: 'Пароли не совпадают.',
};

// Figma S18–S22 and the wait after too many attempts.
export function passwordMessage(
  status: PasswordStatus,
  nowMs: number,
): SettingsMessage | undefined {
  switch (status.kind) {
    case 'limited': {
      const seconds = secondsLeft(status.untilMs, nowMs);
      if (seconds === 0) return undefined;
      return {
        tone: 'error',
        title: 'Слишком много попыток',
        text: `Повторите через ${String(seconds)} с.`,
      };
    }
    case 'storage':
      return {
        tone: 'error',
        title: 'Сервис учётных записей недоступен',
        text: 'Изменение пароля не подтверждено и повторно не отправляется. Сначала обновите данные профиля.',
        action: { kind: 'refresh-profile', label: 'Обновить данные профиля' },
        details: status.code,
      };
    case 'unknown':
      return {
        tone: 'unknown',
        title: 'Результат изменения пароля неизвестен',
        text: 'Ответ не получен — пароль мог измениться. Изменение повторно не отправляется. Чтобы проверить, войдите с новым паролем.',
        action: { kind: 'sign-in-to-check', label: 'Войти с новым паролем' },
      };
    case 'recovering':
      return {
        tone: 'unknown',
        title: 'Учётная запись временно недоступна',
        text: 'Изменение пароля ещё не подтверждено. Не входите заново, пока доступ не восстановится.',
        action: {
          kind: 'check-password',
          label: 'Проверить доступность учётной записи',
        },
        details: status.code,
      };
    case 'checking':
      return {
        tone: 'unknown',
        title: 'Проверяем доступность учётной записи',
        text: 'Читаем данные профиля. Вход заново пока не нужен.',
      };
    case 'unchanged':
      return {
        tone: 'info',
        title: 'Пароль не изменён',
        text: 'Изменение пароля не применилось. Повторите изменение.',
      };
    case 'idle':
    case 'invalid':
    case 'saving':
      return undefined;
  }
}

export function nameLocked(status: NameStatus): boolean {
  return (
    status.kind === 'checking' ||
    status.kind === 'unconfirmed' ||
    status.kind === 'recovering'
  );
}

export function passwordLocked(status: PasswordStatus): boolean {
  return (
    status.kind === 'storage' ||
    status.kind === 'unknown' ||
    status.kind === 'recovering' ||
    status.kind === 'checking'
  );
}

// A name whose save is still unknown reopens the editor on the S09 message.
export function initialName(pending: PendingChanges): {
  editing: boolean;
  draft: string;
  status: NameStatus;
} {
  return pending.name === undefined
    ? { editing: false, draft: '', status: { kind: 'idle' } }
    : {
        editing: true,
        draft: pending.name,
        status: { kind: 'unconfirmed', code: 'AttemptPending' },
      };
}

export function initialPassword(pending: PendingChanges): PasswordStatus {
  if (pending.password === 'unknown') return { kind: 'unknown' };
  if (pending.password === 'recovering') {
    return { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' };
  }
  return { kind: 'idle' };
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

function Message({
  message,
  onAction,
}: {
  message: SettingsMessage;
  onAction: (kind: MessageAction) => void;
}) {
  const { action } = message;
  return (
    <FormMessage
      tone={message.tone}
      title={message.title}
      details={message.details}
      action={
        action && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onAction(action.kind);
            }}
          >
            {action.label}
          </Button>
        )
      }
    >
      {message.text}
    </FormMessage>
  );
}

// Figma S11 and S12: a link or «Выйти» with an unsaved name asks first.
function LeaveNameDialog({
  draft,
  active,
}: {
  draft: string;
  active: boolean;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!blocked || dialog === null) return undefined;
    leaving.current = false;
    dialog.showModal();
    // Esc, the backdrop and «Продолжить редактирование» close the dialog.
    const stay = () => {
      if (!leaving.current) blocker.reset();
    };
    dialog.addEventListener('close', stay);
    return () => {
      dialog.removeEventListener('close', stay);
    };
  }, [blocked, blocker]);
  const exit = blocked && blocker.location.pathname === '/logout';
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title="Не сохранять новое имя?"
      actions={
        <>
          <Button type="submit" order={{ sm: 1 }}>
            Продолжить редактирование
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              leaving.current = true;
              dialogRef.current?.close();
              blocker.proceed?.();
            }}
          >
            {exit ? 'Не сохранять и выйти' : 'Не сохранять и перейти'}
          </Button>
        </>
      }
    >
      <Text textStyle="body.default">
        {`Имя «${draft.trim()}» ещё не сохранено. Если уйти, черновик пропадёт.`}
      </Text>
    </ModalPanel>
  );
}

// Figma S01–S12, S23.
function NameEditor({ user }: { user: User }) {
  const { accountSettings } = useServices();
  const [initial] = useState(() => initialName(accountSettings.pending()));
  const [editing, setEditing] = useState(initial.editing);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState(initial.draft);
  const [status, setStatus] = useState<NameStatus>(initial.status);
  const busy = nameLocked(status) || status.kind === 'saving';
  const message = nameMessage(status, user.displayName);

  const finish = () => {
    setEditing(false);
    setSaved(true);
    setStatus({ kind: 'idle' });
  };
  const check = async (from: NameStatus) => {
    // S07 while reading, except for S06 and S10 which keep their text.
    if (from.kind !== 'storage' && from.kind !== 'recovering') {
      setStatus({ kind: 'checking' });
    }
    const next = nameAfterCheck(from, await accountSettings.checkRename(draft));
    if (next === 'saved') finish();
    else setStatus(next);
  };
  const save = async () => {
    setSaved(false);
    setStatus({ kind: 'saving' });
    const outcome = await accountSettings.rename(draft);
    switch (outcome.kind) {
      case 'saved':
        finish();
        return;
      case 'invalid':
        setStatus({ kind: 'invalid' });
        return;
      case 'storage':
      case 'recovering':
        setStatus({ kind: outcome.kind, code: outcome.code });
        return;
      case 'lost':
        await check({ kind: 'checking' });
        return;
      case 'ended':
        return;
    }
  };

  if (!editing) {
    return (
      <Stack gap="3">
        <Flex align="center" justify="space-between" gap="4" wrap="wrap">
          <Stack gap="0" minW="0">
            <Text textStyle="caption.strong">Отображаемое имя</Text>
            <Text textStyle="body.default" overflowWrap="anywhere">
              {user.displayName}
            </Text>
          </Stack>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setDraft(user.displayName);
              setSaved(false);
              setStatus({ kind: 'idle' });
              setEditing(true);
            }}
          >
            Изменить имя
          </Button>
        </Flex>
        {saved && <FormMessage tone="success" title="Имя сохранено" />}
      </Stack>
    );
  }
  return (
    <>
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FieldGroup>
          <FieldLabel htmlFor="settings-name">Отображаемое имя</FieldLabel>
          <TextInput
            id="settings-name"
            name="displayName"
            autoComplete="name"
            value={draft}
            disabled={busy}
            invalid={status.kind === 'invalid'}
            aria-describedby="settings-name-hint"
            onChange={(event) => {
              setDraft(event.currentTarget.value);
            }}
          />
          <FieldMessage
            id="settings-name-hint"
            error={
              status.kind === 'invalid'
                ? 'Нужно от 2 до 80 символов без пробелов в начале и в конце.'
                : undefined
            }
            hint="От 2 до 80 символов. Пробелы в начале и в конце не сохраняются."
          />
        </FieldGroup>
        <Flex gap="2" wrap="wrap">
          <Button
            type="submit"
            disabled={busy}
            aria-busy={status.kind === 'saving'}
          >
            {status.kind === 'saving' ? 'Сохраняем имя…' : 'Сохранить имя'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setStatus({ kind: 'idle' });
            }}
          >
            Отменить
          </Button>
        </Flex>
        {message && (
          <Message
            message={message}
            onAction={() => {
              void check(status);
            }}
          />
        )}
      </chakra.form>
      <LeaveNameDialog
        draft={draft}
        active={draft.trim() !== user.displayName}
      />
    </>
  );
}

// Figma S13–S22.
function PasswordForm() {
  const { accountSettings, now: clock } = useServices();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PasswordStatus>(() =>
    initialPassword(accountSettings.pending()),
  );
  const now = useNow(status.kind === 'limited');
  const message = passwordMessage(status, now);
  const busy = passwordLocked(status) || status.kind === 'saving';
  const waiting = status.kind === 'limited' && message !== undefined;
  const errorOf = (name: PasswordField): string | undefined => {
    const code = status.kind === 'invalid' ? status.errors[name] : undefined;
    return code === undefined ? undefined : passwordFieldText[code];
  };

  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    setStatus({ kind: 'saving' });
    const outcome = await accountSettings.changePassword({
      currentPassword: field(data.get('currentPassword')),
      newPassword: field(data.get('newPassword')),
      repeat: field(data.get('repeatPassword')),
    });
    switch (outcome.kind) {
      case 'invalid':
        setStatus({ kind: 'invalid', errors: outcome.errors });
        return;
      case 'limited':
        setStatus({
          kind: 'limited',
          untilMs: clock() + outcome.seconds * 1000,
        });
        return;
      case 'storage':
      case 'recovering':
        setStatus({ kind: outcome.kind, code: outcome.code });
        return;
      case 'unknown':
        setStatus({ kind: 'unknown' });
        return;
      // The session has ended: the app gate opens sign-in with the notice.
      case 'changed':
      case 'revoked':
      case 'ended':
        return;
    }
  };
  const act = async (kind: MessageAction) => {
    if (kind === 'refresh-profile') {
      if (await accountSettings.refreshProfile()) setStatus({ kind: 'idle' });
      return;
    }
    if (kind === 'sign-in-to-check') {
      if ((await accountSettings.signInToCheck()) === 'failed') {
        void navigate('/logout');
      }
      return;
    }
    const code =
      status.kind === 'recovering' ? status.code : 'AuthUpdateOutcomeUnknown';
    setStatus({ kind: 'checking' });
    const result = await accountSettings.checkPassword();
    if (result === 'unchanged') setStatus({ kind: 'unchanged' });
    if (result === 'recovering') setStatus({ kind: 'recovering', code });
  };

  const described = (name: PasswordField, id: string) =>
    errorOf(name) === undefined ? undefined : id;
  return (
    <>
      <Text textStyle="body.default" color="text.secondary">
        После изменения пароля завершатся все сеансы, включая этот. Затем
        войдите с новым паролем.
      </Text>
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <chakra.fieldset disabled={busy} display="contents">
          <Stack gap="4">
            <FieldGroup>
              <FieldLabel htmlFor="current-password">Текущий пароль</FieldLabel>
              <PasswordInput
                id="current-password"
                name="currentPassword"
                autoComplete="current-password"
                aria-describedby={described(
                  'currentPassword',
                  'current-password-error',
                )}
              />
              <FieldMessage
                id="current-password-error"
                error={errorOf('currentPassword')}
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="settings-new-password">
                Новый пароль
              </FieldLabel>
              <PasswordInput
                id="settings-new-password"
                name="newPassword"
                autoComplete="new-password"
                aria-describedby="settings-new-password-hint"
              />
              <FieldMessage
                id="settings-new-password-hint"
                error={errorOf('newPassword')}
                hint="От 8 до 32 символов. Можно вставить пароль из менеджера паролей."
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="settings-repeat-password">
                Повторите новый пароль
              </FieldLabel>
              <PasswordInput
                id="settings-repeat-password"
                name="repeatPassword"
                autoComplete="new-password"
                aria-describedby={described(
                  'repeat',
                  'settings-repeat-password-error',
                )}
              />
              <FieldMessage
                id="settings-repeat-password-error"
                error={errorOf('repeat')}
              />
            </FieldGroup>
          </Stack>
        </chakra.fieldset>
        <Button
          type="submit"
          alignSelf="flex-start"
          disabled={busy || waiting}
          aria-busy={status.kind === 'saving'}
        >
          {status.kind === 'saving' ? 'Меняем пароль…' : 'Изменить пароль'}
        </Button>
        {message && (
          <Message
            message={message}
            onAction={(kind) => {
              void act(kind);
            }}
          />
        )}
      </chakra.form>
    </>
  );
}

// Figma S01 «Учётная запись». The app gate keeps this page for an active
// session; after a password change it opens sign-in by itself.
export function AccountSettingsPage() {
  const session = useSession();
  if (session.status !== 'active') return null;
  const { user } = session;
  return (
    <>
      <PageHeader
        title="Учётная запись"
        caption="Логин, почта, отображаемое имя и пароль"
      />
      <Stack gap="6" w="full" maxW={rem(640)}>
        <Section icon={userIcon} title="Профиль">
          <ReadOnlyValue
            label="Логин"
            value={user.login}
            note="Логин нельзя изменить. Он нужен для входа."
          />
          <ReadOnlyValue
            label="Почта"
            value={user.email ?? 'Не указана'}
            mono={user.email !== undefined}
            note={emailNote(user.email)}
          />
          <Box h="1px" bg="border.default" />
          <NameEditor user={user} />
        </Section>
        <Section icon={lockIcon} title="Пароль">
          <PasswordForm />
        </Section>
      </Stack>
    </>
  );
}
