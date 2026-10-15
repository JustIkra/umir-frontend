import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, type LoaderFunctionArgs } from 'react-router';
import {
  isAcceptCodeExpired,
  type AcceptMode,
  type AcceptNotice,
  type AcceptSnapshot,
  type DetailsInput,
  type InvitationAcceptance,
} from '@/application/invitation-acceptance';
import type { OrganizationAccess } from '@/application/access';
import { isEntityId } from '@/domain/ids';
import {
  AuthLayout,
  AuthLead,
  AuthTitle,
} from '@/presentation/auth/auth-layout';
import { rolesCaption } from '@/presentation/app-shell/shell-context';
import { NotFound } from '@/presentation/documents/not-found-page';
import {
  useServices,
  type PresentationServices,
} from '@/presentation/services';
import { useAccess, useSession, useStore } from '@/presentation/session/hooks';
import { Button, ButtonLink, TextLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { formatCountdown, useNow } from '@/presentation/ui/countdown';
import {
  CodeInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import {
  acceptMessage,
  codeError,
  detailsErrors,
  unknownTexts,
  unknownTitles,
} from './invite-messages';

export { acceptMessage } from './invite-messages';

const passwordHint =
  'От 8 до 32 символов. Можно вставить пароль из менеджера паролей.';
const help = 'Письмо не пришло — обратитесь к администратору организации.';

// The sign-in page reads the address to return to from «return».
const signInPath = (invitationID: string) =>
  `/login?return=${encodeURIComponent(`/invite/${invitationID}`)}`;

// /invite/:invitationID: a malformed id is a missing page. A signed-in user
// accepts the invitation, a guest registers: the code from the email is bound
// to that choice, so the flow is opened in the mode of the session.
export function createInviteLoader(services: PresentationServices) {
  return async ({ params }: Pick<LoaderFunctionArgs, 'params'>) => {
    const { invitationID } = params;
    if (!isEntityId(invitationID)) throw new NotFound();
    const state = await services.session.ensure();
    services.invitationAcceptance.open(
      invitationID,
      state.status === 'active' ? 'accept' : 'register',
    );
    return null;
  };
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

function detailsOf(form: HTMLFormElement): DetailsInput {
  const data = new FormData(form);
  return {
    displayName: field(data.get('displayName')),
    password: field(data.get('password')),
    repeat: field(data.get('repeat')),
  };
}

function Message({
  notice,
  nowMs,
  action,
}: {
  notice: AcceptNotice | undefined;
  nowMs: number;
  action?: ReactNode;
}) {
  const message = acceptMessage(notice, nowMs);
  if (message === undefined) return null;
  return (
    <FormMessage tone={message.tone} title={message.title} action={action}>
      {message.text}
    </FormMessage>
  );
}

function Unknown({
  flow,
  notice,
}: {
  flow: InvitationAcceptance;
  notice: AcceptNotice | undefined;
}) {
  if (notice?.kind !== 'unknown') return null;
  return (
    <UnknownOutcomeAlert
      title={unknownTitles[notice.action]}
      onCheck={() => {
        void flow.check();
      }}
    >
      {unknownTexts[notice.action]}
    </UnknownOutcomeAlert>
  );
}

// «Войти другой учётной записью»: the session ends, then sign-in returns to
// the invitation.
function SwitchAccount({ invitationID }: { invitationID: string }) {
  const { session } = useServices();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setFailed(false);
          void session.signOut().then((result) => {
            if (result === 'done') void navigate(signInPath(invitationID));
            else setFailed(true);
          });
        }}
      >
        Войти другой учётной записью
      </Button>
      {failed && (
        <Text textStyle="caption.default" color="text.error" role="alert">
          Не удалось завершить сеанс. Повторите попытку.
        </Text>
      )}
    </>
  );
}

// The name and the password with their repeat: the registration form and the
// details step after a reload.
function DetailsForm({
  snapshot,
  submit,
  label,
  busyLabel,
}: {
  snapshot: AcceptSnapshot;
  submit: (input: DetailsInput) => Promise<void>;
  label: string;
  busyLabel: string;
}) {
  const unknown = snapshot.notice?.kind === 'unknown';
  const errors = detailsErrors(snapshot.notice);
  const now = useNow(snapshot.notice?.kind === 'limited');
  const message = acceptMessage(snapshot.notice, now);
  const waiting = snapshot.notice?.kind === 'limited' && message !== undefined;
  return (
    <chakra.form
      noValidate
      display="flex"
      flexDirection="column"
      gap="6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(detailsOf(event.currentTarget));
      }}
    >
      <chakra.fieldset disabled={unknown || snapshot.busy} display="contents">
        <FieldGroup>
          <FieldLabel htmlFor="invite-name">Имя</FieldLabel>
          <TextInput
            id="invite-name"
            name="displayName"
            autoComplete="name"
            defaultValue={snapshot.displayName}
            invalid={errors.name !== undefined}
            aria-describedby="invite-name-error"
          />
          <FieldMessage
            id="invite-name-error"
            error={errors.name}
            hint="От 2 до 80 символов. Так вас увидят коллеги."
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="invite-password">Пароль</FieldLabel>
          <PasswordInput
            id="invite-password"
            name="password"
            autoComplete="new-password"
            invalid={errors.password !== undefined}
            aria-describedby="invite-password-hint"
          />
          <FieldMessage
            id="invite-password-hint"
            error={errors.password}
            hint={passwordHint}
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="invite-repeat">Повторите пароль</FieldLabel>
          <PasswordInput
            id="invite-repeat"
            name="repeat"
            autoComplete="new-password"
            invalid={errors.repeat !== undefined}
            aria-describedby={
              errors.repeat === undefined ? undefined : 'invite-repeat-error'
            }
          />
          <FieldMessage id="invite-repeat-error" error={errors.repeat} />
        </FieldGroup>
      </chakra.fieldset>
      <Button
        type="submit"
        w="full"
        disabled={snapshot.busy || waiting || unknown}
        aria-busy={snapshot.busy}
      >
        {snapshot.busy ? busyLabel : label}
      </Button>
    </chakra.form>
  );
}

function StartStep({
  flow,
  snapshot,
  mode,
  invitationID,
}: {
  flow: InvitationAcceptance;
  snapshot: AcceptSnapshot;
  mode: AcceptMode;
  invitationID: string;
}) {
  const session = useSession();
  const now = useNow(snapshot.notice?.kind === 'limited');
  const { notice } = snapshot;
  if (mode === 'register') {
    return (
      <>
        <AuthTitle>Приглашение в «Ровный ход»</AuthTitle>
        <AuthLead>
          Вас пригласили в организацию. Чтобы принять приглашение, создайте
          учётную запись: укажите имя и пароль, затем подтвердите почту кодом из
          письма.
        </AuthLead>
        <Unknown flow={flow} notice={notice} />
        <DetailsForm
          snapshot={snapshot}
          submit={(input) => flow.register(input)}
          label="Получить код"
          busyLabel="Отправляем…"
        />
        <Message
          notice={notice}
          nowMs={now}
          action={
            notice?.kind === 'email-taken' ? (
              <ButtonLinkToSignIn invitationID={invitationID} />
            ) : undefined
          }
        />
        <Text textStyle="body.default">
          Уже есть учётная запись?{' '}
          <TextLink to={signInPath(invitationID)}>Войти</TextLink>
        </Text>
      </>
    );
  }
  const name = session.status === 'active' ? session.user.displayName : '';
  const unknown = notice?.kind === 'unknown';
  const waiting =
    notice?.kind === 'limited' && acceptMessage(notice, now) !== undefined;
  return (
    <>
      <AuthTitle>Приглашение в «Ровный ход»</AuthTitle>
      <AuthLead>
        {`Вы вошли как ${name}. Код подтверждения придёт на почту, указанную в приглашении.`}
      </AuthLead>
      <Unknown flow={flow} notice={notice} />
      <Button
        type="button"
        w="full"
        disabled={snapshot.busy || waiting || unknown}
        aria-busy={snapshot.busy}
        onClick={() => {
          void flow.requestCode();
        }}
      >
        {snapshot.busy ? 'Отправляем…' : 'Получить код'}
      </Button>
      <Message
        notice={notice}
        nowMs={now}
        action={
          notice?.kind === 'other-email' ? (
            <SwitchAccount invitationID={invitationID} />
          ) : undefined
        }
      />
      {notice?.kind !== 'other-email' && (
        <Flex>
          <SwitchAccount invitationID={invitationID} />
        </Flex>
      )}
    </>
  );
}

function ButtonLinkToSignIn({ invitationID }: { invitationID: string }) {
  return (
    <ButtonLink to={signInPath(invitationID)} variant="secondary">
      Войти
    </ButtonLink>
  );
}

function CodeStep({
  flow,
  snapshot,
}: {
  flow: InvitationAcceptance;
  snapshot: AcceptSnapshot;
}) {
  const now = useNow(true);
  const { notice } = snapshot;
  const locked = notice?.kind === 'locked';
  const unknown = notice?.kind === 'unknown';
  const expired =
    isAcceptCodeExpired(snapshot, now) || notice?.kind === 'expired';
  // The notice's own message wins over the expiry text.
  const own = acceptMessage(notice, now);
  const shown =
    own ?? (expired ? acceptMessage({ kind: 'expired' }, now) : undefined);
  const limited = notice?.kind === 'limited' && own !== undefined;
  const error = codeError(notice);
  const resendIn = (snapshot.resendAtMs ?? now) - now;
  const closed = unknown || snapshot.busy || locked || expired;
  return (
    <>
      <AuthTitle>Введите код из письма</AuthTitle>
      <AuthLead>
        Код отправлен на почту, указанную в приглашении. Он действует 10 минут.
      </AuthLead>
      <Unknown flow={flow} notice={notice} />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void flow.verify(field(data.get('code')));
        }}
      >
        <chakra.fieldset disabled={closed} display="contents">
          <FieldGroup>
            <FieldLabel htmlFor="invite-code">Код из письма</FieldLabel>
            <CodeInput
              id="invite-code"
              name="code"
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby="invite-code-hint"
            />
            <FieldMessage
              id="invite-code-hint"
              error={error}
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
            disabled={unknown || snapshot.busy || limited}
            onClick={() => {
              void flow.resend();
            }}
          >
            Отправить код повторно
          </Button>
        )}
        <Button
          type="submit"
          w="full"
          disabled={closed}
          aria-busy={snapshot.busy}
        >
          {snapshot.busy ? 'Проверяем…' : 'Подтвердить'}
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
                  disabled={unknown || snapshot.busy}
                  onClick={() => {
                    void flow.requestCode();
                  }}
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

function DetailsStep({
  flow,
  snapshot,
  mode,
}: {
  flow: InvitationAcceptance;
  snapshot: AcceptSnapshot;
  mode: AcceptMode;
}) {
  const now = useNow(snapshot.notice?.kind === 'limited');
  if (mode === 'register') {
    return (
      <>
        <AuthTitle>Завершите регистрацию</AuthTitle>
        <AuthLead>
          Почта подтверждена. Укажите имя и пароль: после перезагрузки страницы
          они не сохраняются.
        </AuthLead>
        <Unknown flow={flow} notice={snapshot.notice} />
        <DetailsForm
          snapshot={snapshot}
          submit={(input) => flow.completeDetails(input)}
          label="Создать учётную запись"
          busyLabel="Создаём…"
        />
        <Message notice={snapshot.notice} nowMs={now} />
      </>
    );
  }
  const unknown = snapshot.notice?.kind === 'unknown';
  return (
    <>
      <AuthTitle>Завершите принятие приглашения</AuthTitle>
      <AuthLead>Почта подтверждена. Осталось принять приглашение.</AuthLead>
      <Unknown flow={flow} notice={snapshot.notice} />
      <Button
        type="button"
        w="full"
        disabled={snapshot.busy || unknown}
        aria-busy={snapshot.busy}
        onClick={() => {
          void flow.acceptInvitation();
        }}
      >
        {snapshot.busy ? 'Принимаем…' : 'Принять приглашение'}
      </Button>
      <Message notice={snapshot.notice} nowMs={now} />
    </>
  );
}

// What the acceptance opened: the restaurants of the organization with the
// roles of the user. A restaurant that is still being prepared has no link.
function RestaurantRows({
  organizations,
}: {
  organizations: readonly OrganizationAccess[];
}) {
  return (
    <Stack as="ul" gap="3" listStyleType="none" p="0" m="0">
      {organizations.flatMap((organization) =>
        organization.restaurants
          .filter(
            (restaurant) =>
              restaurant.lifecycle === 'ready' ||
              restaurant.lifecycle === 'registering',
          )
          .map((restaurant) => (
            <Flex
              as="li"
              key={restaurant.restaurantID}
              wrap="wrap"
              align="center"
              justify="space-between"
              gap="3"
              p="3"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="md"
            >
              <Stack gap="0.5" minW="0">
                <Text textStyle="body.strong">{restaurant.name}</Text>
                <Text textStyle="caption.default" color="text.secondary">
                  {`${organization.name} · ${rolesCaption(restaurant.roles)}`}
                </Text>
              </Stack>
              {restaurant.lifecycle === 'ready' ? (
                <ButtonLink
                  variant="secondary"
                  to={`/app/r/${restaurant.restaurantID}`}
                  aria-label={`Открыть: ${restaurant.name}`}
                >
                  Открыть
                </ButtonLink>
              ) : (
                <Badge>Подготавливается</Badge>
              )}
            </Flex>
          )),
      )}
    </Stack>
  );
}

function DoneStep({ snapshot }: { snapshot: AcceptSnapshot }) {
  const access = useAccess();
  let known: readonly OrganizationAccess[] = [];
  if (access.status === 'ready') known = access.organizations;
  else if (access.status === 'unverified') known = access.previous ?? [];
  const orgID = snapshot.membership?.orgID;
  const organizations =
    orgID === undefined
      ? known
      : known.filter((organization) => organization.orgID === orgID);
  const listed = organizations.some(
    (organization) => organization.restaurants.length > 0,
  );
  return (
    <>
      <AuthTitle>Приглашение принято</AuthTitle>
      <AuthLead>
        {snapshot.mode === 'register'
          ? 'Учётная запись создана. Вы вошли и состоите в организации.'
          : 'Вы состоите в организации.'}
      </AuthLead>
      {listed && <RestaurantRows organizations={organizations} />}
      <ButtonLink to="/app" w="full">
        Перейти к работе
      </ButtonLink>
    </>
  );
}

const titles = {
  start: 'Приглашение',
  code: 'Введите код',
  details: 'Завершите регистрацию',
  done: 'Приглашение принято',
} as const;

// /invite/:invitationID: the invitee confirms the email with a code, then
// registers (a guest) or accepts the invitation (a signed-in user).
export function InviteAcceptancePage() {
  const { invitationAcceptance: flow } = useServices();
  const { invitationID } = useParams();
  const snapshot = useStore(flow);
  const session = useSession();
  // A finished flow keeps its mode: a registration leaves a signed-in user.
  const mode: AcceptMode =
    snapshot.step === 'done'
      ? snapshot.mode
      : session.status === 'active'
        ? 'accept'
        : 'register';
  // The session changed under the page (signed out, expired): the code is
  // bound to the old mode, so the flow starts over in the new one.
  useEffect(() => {
    if (
      invitationID !== undefined &&
      snapshot.step !== 'done' &&
      snapshot.mode !== mode
    ) {
      flow.open(invitationID, mode);
    }
  }, [flow, invitationID, mode, snapshot.mode, snapshot.step]);
  // A finished invitation is not offered again when the page is opened anew.
  useEffect(
    () => () => {
      if (flow.getSnapshot().step === 'done') flow.restart();
    },
    [flow],
  );
  if (invitationID === undefined) return null;
  return (
    <>
      <meta name="referrer" content="no-referrer" />
      <AuthLayout
        title={titles[snapshot.step]}
        {...(snapshot.step === 'code' ? { help } : {})}
      >
        {snapshot.step === 'start' && (
          <StartStep
            flow={flow}
            snapshot={snapshot}
            mode={mode}
            invitationID={invitationID}
          />
        )}
        {snapshot.step === 'code' && (
          <CodeStep flow={flow} snapshot={snapshot} />
        )}
        {snapshot.step === 'details' && (
          <DetailsStep flow={flow} snapshot={snapshot} mode={mode} />
        )}
        {snapshot.step === 'done' && <DoneStep snapshot={snapshot} />}
      </AuthLayout>
    </>
  );
}
