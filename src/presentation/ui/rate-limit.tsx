import { chakra } from '@chakra-ui/react';
import { useCallback, useState } from 'react';
import { useServices } from '@/presentation/services';
import { formatCountdown, useNow } from './countdown';
import { FormMessage } from './form-message';

export interface WaitView {
  // True until the wait Gateway named is over.
  readonly waiting: boolean;
  // Milliseconds left, zero when over or never started.
  readonly left: number;
  // Seconds of the wait as it was started, for the screen reader.
  readonly seconds: number | undefined;
  readonly started: boolean;
}

export interface RetryWait extends WaitView {
  begin(seconds: number): void;
  clear(): void;
}

// A wait whose end is fixed elsewhere (the order flow keeps the moment in its
// phase): the same countdown without owning the state.
export function useDeadline(
  until: number | undefined,
  seconds: number | undefined,
): WaitView {
  const { now } = useServices();
  const clock = useNow(until !== undefined && until > now());
  const left = until === undefined ? 0 : Math.max(0, until - clock);
  return { waiting: left > 0, left, seconds, started: until !== undefined };
}

// The wait after a 429 «Слишком много запросов» (C16). The command was not
// sent, so the input stays and the button opens again when the wait is over;
// nothing is repeated on its own.
export function useRetryWait(): RetryWait {
  const { now } = useServices();
  const [wait, setWait] = useState<
    { readonly until: number; readonly seconds: number } | undefined
  >();
  const clock = useNow(wait !== undefined && wait.until > now());
  const left = wait === undefined ? 0 : Math.max(0, wait.until - clock);
  const begin = useCallback(
    (seconds: number) => {
      setWait({ until: now() + seconds * 1000, seconds });
    },
    [now],
  );
  const clear = useCallback(() => {
    setWait(undefined);
  }, []);
  return {
    waiting: left > 0,
    left,
    seconds: wait?.seconds,
    started: wait !== undefined,
    begin,
    clear,
  };
}

// The words of a 429 for any screen. The countdown is hidden from the screen
// reader, which hears the whole wait once and «можно повторить» at the end.
export function RateLimitMessage({ wait }: { wait: WaitView }) {
  if (!wait.started) return null;
  return (
    <FormMessage tone="error" title="Слишком много запросов">
      {wait.waiting ? (
        <>
          Мы ничего не отправили, ваши данные остались на месте. Повторите через{' '}
          <chakra.span aria-hidden="true" textStyle="numeric.default">
            {formatCountdown(wait.left)}
          </chakra.span>
          <chakra.span srOnly>{`${String(wait.seconds ?? 0)} с`}</chakra.span>.
        </>
      ) : (
        'Можно отправить ещё раз.'
      )}
    </FormMessage>
  );
}
