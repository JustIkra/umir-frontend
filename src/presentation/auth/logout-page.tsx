import { Stack, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useServices } from '@/presentation/services';
import { Button } from '@/presentation/ui/actions';
import { AuthLayout, AuthTitle } from './auth-layout';

type LogoutState = 'pending' | 'failed' | 'active';

// Figma O03 and O05: until gateway confirms the sign-out, the data stays
// hidden and the page offers to repeat it or to check the session.
export function LogoutPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<LogoutState>('pending');
  const started = useRef(false);
  const signOut = useCallback(() => {
    void session.signOut().then((result) => {
      if (result === 'done') void navigate('/login', { replace: true });
      else setState('failed');
    });
  }, [session, navigate]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signOut();
  }, [signOut]);
  const again = () => {
    setState('pending');
    signOut();
  };
  const check = () => {
    void session.check().then((status) => {
      if (status === 'ended') void navigate('/login', { replace: true });
      else if (status === 'active') setState('active');
    });
  };
  if (state === 'pending') {
    return (
      <AuthLayout title="Выход">
        <AuthTitle>Выход</AuthTitle>
        <Text textStyle="body.default" color="text.secondary">
          Завершаем сессию…
        </Text>
      </AuthLayout>
    );
  }
  if (state === 'active') {
    return (
      <AuthLayout title="Сессия ещё активна">
        <AuthTitle>Сессия ещё активна</AuthTitle>
        <Text textStyle="body.default" color="text.secondary">
          Данные остаются скрытыми. Завершите выход, чтобы закрыть сессию на
          этом устройстве.
        </Text>
        <Button onClick={again}>Завершить выход</Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Выход ещё не подтверждён">
      <AuthTitle>Выход ещё не подтверждён</AuthTitle>
      <Text textStyle="body.default" color="text.secondary">
        Данные скрыты. Ответ на запрос выхода не получен.
      </Text>
      <Stack gap="2">
        <Button onClick={again}>Повторить выход</Button>
        <Button variant="secondary" onClick={check}>
          Проверить сессию
        </Button>
      </Stack>
    </AuthLayout>
  );
}
