import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useId, useRef, useState } from 'react';
import type {
  FeedbackOutcome,
  FeedbackSubmitter,
} from '@/application/feedback';
import {
  codePointLength,
  emptyFeedbackDraft,
  feedbackFieldOrder,
  feedbackMessageLimit,
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackField,
  type FeedbackFieldError,
  type FeedbackFieldErrors,
} from '@/domain/feedback';
import spinnerIcon from '@/presentation/assets/icons/spinner-on-action-20.svg';
import { useServices } from '@/presentation/services';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  CheckboxField,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextArea,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon } from '@/presentation/ui/icon';
import { plural } from '@/presentation/ui/plural';

type Status =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'done'; outcome: Exclude<FeedbackOutcome, { kind: 'invalid' }> };

function errorText(field: FeedbackField, error: FeedbackFieldError): string {
  switch (error) {
    case 'Required':
      return {
        name: 'Введите имя',
        email: 'Введите почту',
        phone: 'Введите телефон',
        message: 'Напишите сообщение',
        consent: 'Нужно согласие на обработку персональных данных',
      }[field];
    case 'TooShort':
      return 'Слишком коротко';
    case 'TooLong':
      return {
        name: 'Сократите имя до 100 символов',
        email: 'Адрес почты не может быть длиннее 254 символов',
        phone: 'Сократите телефон до 32 символов',
        message: `Сократите сообщение до ${String(feedbackMessageLimit)} символов`,
        consent: 'Нужно согласие на обработку персональных данных',
      }[field];
    case 'InvalidFormat':
      return field === 'phone'
        ? 'Проверьте телефон: например, +7 900 000-00-00'
        : 'Проверьте почту: например, name@example.ru';
    case 'InvalidCharacters':
      return field === 'phone'
        ? 'В телефоне можно писать только цифры, пробел, +, -, ( и )'
        : 'Уберите лишние символы';
    case 'ConsentRequired':
      return 'Нужно согласие на обработку персональных данных';
    case 'ConsentOutdated':
      return 'Текст согласия обновился — прочитайте его и отметьте согласие снова';
  }
}

const fieldsToCheck = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens < 11 || tens > 14) {
    if (ones === 1) return `${String(count)} поле`;
    if (ones >= 2 && ones <= 4) return `${String(count)} поля`;
  }
  return `${String(count)} полей`;
};

const retryAfterText = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${String(minutes)}\u00A0${plural(minutes, 'минуту', 'минуты', 'минут')}`;
};

// Figma Feedback form 205:3747 with the states Default, Filled, Field errors,
// Submitting, Sent, Rate limited, Unavailable and Unknown. The landing sends
// anonymously (the default submitter); the app passes the submitter of its
// restaurant and the name and email of the signed-in user, which the form
// returns to after a sent message.
export function FeedbackForm({
  submitter,
  initial,
}: {
  submitter?: FeedbackSubmitter;
  initial?: Partial<Pick<FeedbackDraft, 'name' | 'email'>>;
}) {
  const { feedback } = useServices();
  const sender = submitter ?? feedback;
  const start: FeedbackDraft = { ...emptyFeedbackDraft, ...initial };
  const id = useId();
  const [draft, setDraft] = useState<FeedbackDraft>(start);
  const [fieldErrors, setFieldErrors] = useState<FeedbackFieldErrors>({});
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'editing' });
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);

  const rateLimit =
    status.kind === 'done' && status.outcome.kind === 'rateLimited'
      ? status.outcome.retryAfterSeconds
      : undefined;
  useEffect(() => {
    if (rateLimit === undefined) return;
    const timer = window.setTimeout(() => {
      setStatus({ kind: 'editing' });
    }, rateLimit * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [rateLimit]);

  const submitting = status.kind === 'submitting';
  const errorCount = Object.keys(fieldErrors).length;

  const update = <K extends keyof FeedbackDraft>(
    key: K,
    value: FeedbackDraft[K],
  ) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (checked) setFieldErrors(validateFeedbackDraft(next));
  };

  const submit = async () => {
    if (submitting || rateLimit !== undefined) return;
    setStatus({ kind: 'submitting' });
    const outcome = await sender.submit(draft);
    if (outcome.kind === 'invalid') {
      setChecked(true);
      setFieldErrors(outcome.fieldErrors);
      setStatus({ kind: 'editing' });
      const first = feedbackFieldOrder.find(
        (field) => outcome.fieldErrors[field],
      );
      const controls = {
        name: nameInput,
        email: emailInput,
        phone: phoneInput,
        message: messageInput,
        consent: consentInput,
      };
      if (first) controls[first].current?.focus();
      return;
    }
    if (outcome.kind === 'sent') {
      setDraft(start);
      setChecked(false);
      setFieldErrors({});
    }
    setStatus({ kind: 'done', outcome });
  };

  const fieldId = (field: FeedbackField) => `${id}-${field}`;
  const messageId = (field: FeedbackField) => `${id}-${field}-message`;
  const error = (field: FeedbackField) => {
    const code = fieldErrors[field];
    return code ? errorText(field, code) : undefined;
  };
  const messageLength = codePointLength(draft.message);

  return (
    <chakra.form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      aria-label="Форма обратной связи"
      display="flex"
      flexDirection="column"
      gap="5"
      p={{ base: '5', sm: '8' }}
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
    >
      <Text textStyle="caption.default" color="text.secondary">
        Все поля, кроме отмеченных «необязательно», нужно заполнить.
      </Text>
      <FieldGroup>
        <FieldLabel htmlFor={fieldId('name')}>Имя</FieldLabel>
        <TextInput
          ref={nameInput}
          id={fieldId('name')}
          name="name"
          autoComplete="name"
          value={draft.name}
          onChange={(event) => {
            update('name', event.target.value);
          }}
          readOnly={submitting}
          invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? messageId('name') : undefined}
        />
        <FieldMessage id={messageId('name')} error={error('name')} />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel htmlFor={fieldId('email')}>Почта</FieldLabel>
        <TextInput
          ref={emailInput}
          id={fieldId('email')}
          name="email"
          type="email"
          autoComplete="email"
          value={draft.email}
          onChange={(event) => {
            update('email', event.target.value);
          }}
          readOnly={submitting}
          invalid={Boolean(fieldErrors.email)}
          aria-describedby={messageId('email')}
        />
        <FieldMessage
          id={messageId('email')}
          error={error('email')}
          hint="Ответим на эту почту."
        />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel htmlFor={fieldId('phone')}>
          Телефон (необязательно)
        </FieldLabel>
        <TextInput
          ref={phoneInput}
          id={fieldId('phone')}
          name="phone"
          type="tel"
          autoComplete="tel"
          value={draft.phone}
          onChange={(event) => {
            update('phone', event.target.value);
          }}
          readOnly={submitting}
          invalid={Boolean(fieldErrors.phone)}
          aria-describedby={messageId('phone')}
        />
        <FieldMessage
          id={messageId('phone')}
          error={error('phone')}
          hint="Например, +7 900 000-00-00"
        />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel htmlFor={fieldId('message')}>Сообщение</FieldLabel>
        <TextArea
          ref={messageInput}
          id={fieldId('message')}
          name="message"
          value={draft.message}
          onChange={(event) => {
            update('message', event.target.value);
          }}
          readOnly={submitting}
          invalid={Boolean(fieldErrors.message)}
          aria-describedby={messageId('message')}
        />
        <FieldMessage
          id={messageId('message')}
          error={error('message')}
          live={messageLength > feedbackMessageLimit - 100}
          hint={
            messageLength === 0
              ? `до ${String(feedbackMessageLimit)} символов`
              : `${String(messageLength)} из ${String(feedbackMessageLimit)}`
          }
        />
      </FieldGroup>
      <Stack gap="1.5">
        <CheckboxField
          ref={consentInput}
          id={fieldId('consent')}
          name="consent"
          label="Даю согласие на обработку персональных данных"
          checked={draft.consent}
          onChange={(event) => {
            update('consent', event.target.checked);
          }}
          disabled={submitting}
          invalid={Boolean(fieldErrors.consent)}
          aria-describedby={
            fieldErrors.consent ? messageId('consent') : undefined
          }
        />
        <Flex wrap="wrap" columnGap="4" rowGap="1" pl="10">
          <TextLink to="/consent" size="caption">
            Текст согласия
          </TextLink>
          <TextLink to="/privacy" size="caption">
            Политика конфиденциальности
          </TextLink>
        </Flex>
        <FieldMessage
          id={messageId('consent')}
          error={error('consent')}
          indent
        />
      </Stack>
      {/* Trap for bots: hidden from people and assistive technology. */}
      <Box aria-hidden="true" srOnly>
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={draft.website}
          onChange={(event) => {
            update('website', event.target.value);
          }}
        />
      </Box>
      <Box>
        <Button
          type="submit"
          disabled={rateLimit !== undefined}
          aria-disabled={submitting || undefined}
        >
          {submitting && (
            <Icon
              src={spinnerIcon}
              size={20}
              animation="spin 1s linear infinite"
            />
          )}
          {submitting ? 'Отправляем…' : 'Отправить'}
        </Button>
      </Box>
      {errorCount > 0 && (
        <FormMessage tone="error" title="Сообщение не отправлено">
          Проверьте {fieldsToCheck(errorCount)} выше.
        </FormMessage>
      )}
      {status.kind === 'done' && (
        <Outcome outcome={status.outcome} retry={() => void submit()} />
      )}
    </chakra.form>
  );
}

function Outcome({
  outcome,
  retry,
}: {
  outcome: Exclude<FeedbackOutcome, { kind: 'invalid' }>;
  retry: () => void;
}) {
  switch (outcome.kind) {
    case 'sent':
      return (
        <FormMessage tone="success" title="Сообщение отправлено">
          Мы ответим на почту, которую вы указали.
        </FormMessage>
      );
    case 'rateLimited':
      return (
        <FormMessage tone="error" title="Слишком много сообщений">
          Попробуйте через {retryAfterText(outcome.retryAfterSeconds)}. Текст
          остался в форме.
        </FormMessage>
      );
    case 'unavailable':
      return (
        <FormMessage
          tone="error"
          title="Не получилось отправить сообщение"
          details={outcome.diagnostics}
          action={
            <Button variant="secondary" onClick={retry}>
              Отправить ещё раз
            </Button>
          }
        >
          Текст остался в форме — попробуйте через пару минут.
        </FormMessage>
      );
    case 'unknown':
      return (
        <FormMessage
          tone="unknown"
          title="Не знаем, дошло ли сообщение"
          action={
            <Button variant="secondary" onClick={retry}>
              Отправить ещё раз
            </Button>
          }
        >
          Связь прервалась. Отправьте ещё раз — дубля не будет.
        </FormMessage>
      );
  }
}
