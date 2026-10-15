import { Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { redirect, useNavigate } from 'react-router';
import type { SessionStore } from '@/application/session';
import {
  useServices,
  type PresentationServices,
} from '@/presentation/services';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { AuthLayout, AuthTitle } from './auth-layout';

// confirm: nothing has been sent; the rest follow a press of «Выйти».
export type LogoutState = 'confirm' | 'pending' | 'failed' | 'active';

// /logout: opening the address sends nothing, a guest has nothing to leave.
// Only a press of «Выйти» ends the session.
export function createLogoutLoader(services: PresentationServices) {
  return async () => {
    if ((await services.session.ensure()).status === 'anonymous') {
      return redirect('/login');
    }
    return null;
  };
}

// Figma O03 and O05: until gateway confirms the sign-out, the data stays
// hidden and the page offers to repeat it or to check the result.
export function signOutOnPress(
  session: Pick<SessionStore, 'signOut'>,
  to: {
    readonly show: (state: LogoutState) => void;
    readonly leave: () => void;
  },
): void {
  to.show('pending');
  void session.signOut().then((result) => {
    if (result === 'done') to.leave();
    else to.show('failed');
  });
}

export function LogoutPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<LogoutState>('confirm');
  const leave = () => {
    void navigate('/login', { replace: true });
  };
  const signOut = () => {
    signOutOnPress(session, { show: setState, leave });
  };
  const check = () => {
    void session.check().then((status) => {
      if (status === 'ended') leave();
      else if (status === 'active') setState('active');
    });
  };
  return <LogoutView state={state} onSignOut={signOut} onCheck={check} />;
}

export function LogoutView({
  state,
  onSignOut,
  onCheck,
}: {
  state: LogoutState;
  onSignOut: () => void;
  onCheck: () => void;
}) {
  if (state === 'confirm') {
    return (
      <AuthLayout title="Выйти из аккаунта?">
        <AuthTitle>Выйти из аккаунта?</AuthTitle>
        <Text textStyle="body.default" color="text.secondary">
          Вы выйдете на этом устройстве. Чтобы продолжить работу, войдите снова.
        </Text>
        <Stack gap="2">
          <Button onClick={onSignOut}>Выйти</Button>
          <ButtonLink variant="secondary" to="/app">
            Остаться
          </ButtonLink>
        </Stack>
      </AuthLayout>
    );
  }
  if (state === 'pending') {
    return (
      <AuthLayout title="Выход">
        <AuthTitle>Выход</AuthTitle>
        <Text textStyle="body.default" color="text.secondary">
          Выходим…
        </Text>
      </AuthLayout>
    );
  }
  if (state === 'active') {
    return (
      <AuthLayout title="Вы ещё не вышли">
        <AuthTitle>Вы ещё не вышли</AuthTitle>
        <Text textStyle="body.default" color="text.secondary">
          Данные пока скрыты. Нажмите «Выйти», чтобы выйти на этом устройстве.
        </Text>
        <Button onClick={onSignOut}>Выйти</Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Не знаем, получилось ли выйти">
      <AuthTitle>Не знаем, получилось ли выйти</AuthTitle>
      <Text textStyle="body.default" color="text.secondary">
        Связь прервалась. Данные пока скрыты.
      </Text>
      <Stack gap="2">
        <Button onClick={onSignOut}>Выйти ещё раз</Button>
        <Button variant="secondary" onClick={onCheck}>
          Проверить результат
        </Button>
      </Stack>
    </AuthLayout>
  );
}
