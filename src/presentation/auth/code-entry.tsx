import { Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Button } from '@/presentation/ui/actions';
import { formatCountdown, useNow } from '@/presentation/ui/countdown';
import {
  CodeInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { AuthLead, AuthTitle } from './auth-layout';

// The step «Введите код из письма» that the invitation and the registration
// share: the code field, the resend with its wait, and the message of the
// last answer. idPrefix keeps the ids of each page.

export interface CodeMessage {
  readonly tone: 'error' | 'success';
  readonly title: string;
  readonly text: string;
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

export function CodeEntry<N extends { readonly kind: string }>({
  idPrefix,
  lead,
  state,
  isExpired,
  notice,
  expiredNotice,
  messageOf,
  codeError,
  unknown,
  onVerify,
  onResend,
  onRenew,
}: {
  idPrefix: string;
  lead: ReactNode;
  state: {
    readonly resendAtMs: number | undefined;
    readonly busy: boolean;
  };
  // The code is past its time at nowMs, without a request.
  isExpired: (nowMs: number) => boolean;
  notice: N | undefined;
  // The notice that says the code ran out.
  expiredNotice: N;
  messageOf: (notice: N | undefined, nowMs: number) => CodeMessage | undefined;
  codeError: string | undefined;
  // The alert for a lost answer, when there is one.
  unknown: ReactNode;
  onVerify: (code: string) => void;
  onResend: () => void;
  onRenew: () => void;
}) {
  const now = useNow(true);
  const locked = notice?.kind === 'locked';
  const lost = notice?.kind === 'unknown';
  const expired = isExpired(now) || notice?.kind === 'expired';
  // The notice's own message wins over the expiry text.
  const own = messageOf(notice, now);
  const shown = own ?? (expired ? messageOf(expiredNotice, now) : undefined);
  const limited = notice?.kind === 'limited' && own !== undefined;
  const resendIn = (state.resendAtMs ?? now) - now;
  const closed = lost || state.busy || locked || expired;
  return (
    <>
      <AuthTitle>Введите код из письма</AuthTitle>
      <AuthLead>{lead}</AuthLead>
      {unknown}
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onVerify(field(data.get('code')));
        }}
      >
        <chakra.fieldset disabled={closed} display="contents">
          <FieldGroup>
            <FieldLabel htmlFor={`${idPrefix}-code`}>Код из письма</FieldLabel>
            <CodeInput
              id={`${idPrefix}-code`}
              name="code"
              aria-invalid={codeError === undefined ? undefined : true}
              aria-describedby={`${idPrefix}-code-hint`}
            />
            <FieldMessage
              id={`${idPrefix}-code-hint`}
              error={codeError}
              hint="6 цифр из письма. Код можно вставить целиком."
            />
          </FieldGroup>
        </chakra.fieldset>
        {expired || locked ? null : resendIn > 0 ? (
          <Text textStyle="caption.default" color="text.secondary">
            {`Отправить код повторно можно через ${formatCountdown(resendIn)}`}
          </Text>
        ) : (
          <Button
            type="button"
            variant="link"
            alignSelf="flex-start"
            disabled={lost || state.busy || limited}
            onClick={onResend}
          >
            Отправить код повторно
          </Button>
        )}
        <Button type="submit" w="full" disabled={closed} aria-busy={state.busy}>
          {state.busy ? 'Проверяем…' : 'Подтвердить'}
        </Button>
        {shown !== undefined && (
          <FormMessage
            tone={shown.tone}
            title={shown.title}
            action={
              expired || locked ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={lost || state.busy}
                  onClick={onRenew}
                >
                  Получить новый код
                </Button>
              ) : undefined
            }
          >
            {shown.text}
          </FormMessage>
        )}
      </chakra.form>
    </>
  );
}
