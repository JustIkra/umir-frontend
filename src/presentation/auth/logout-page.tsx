import { Stack, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useServices } from '@/presentation/services';
import { Button } from '@/presentation/ui/actions';
import { AuthLayout, AuthTitle } from './auth-layout';

type LogoutState = 'pending' | 'failed' | 'active';

// Figma O03 and O05: until gateway confirms the sign-out, the data stays
// hidden and the page offers to repeat it or to check the result.
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
        <Button onClick={again}>Выйти</Button>
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
        <Button onClick={again}>Выйти ещё раз</Button>
        <Button variant="secondary" onClick={check}>
          Проверить результат
        </Button>
      </Stack>
    </AuthLayout>
  );
}
