import { useState, useSyncExternalStore } from 'react';
import type { AttemptState } from '@/application/durable-attempts';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { Button, ButtonLink } from './actions';
import {
  attemptPlaces,
  type AttemptPlace,
  type AttemptPlaceKey,
} from './attempt-messages';
import { FormMessage } from './form-message';

// What a screen reads about one operation's saved attempt.
export function useAttemptFlags(state: AttemptState): {
  readonly notSaved: boolean;
  readonly damaged: boolean;
} {
  // getSnapshot doubles as the server snapshot: route tests render on the
  // server.
  const readNotSaved = () => state.notSaved();
  const readDamaged = () => state.damaged();
  const notSaved = useSyncExternalStore(
    state.subscribe,
    readNotSaved,
    readNotSaved,
  );
  const damaged = useSyncExternalStore(
    state.subscribe,
    readDamaged,
    readDamaged,
  );
  return { notSaved, damaged };
}

// The browser refuses to remember the attempt: the screen works, only a
// reload loses the way back to its result.
export function NotSavedNotice({ text }: { text: string }) {
  return (
    <FormMessage tone="info" title="Страницу лучше не перезагружать">
      {text}
    </FormMessage>
  );
}

export type DiscardStep = 'closed' | 'confirm' | 'refused' | 'unavailable';

const stepText = {
  refused:
    'Эту отправку отменить нельзя. Обновите страницу и проверьте результат.',
  unavailable:
    'Браузер не даёт отменить прошлую отправку. Обновите страницу и попробуйте ещё раз.',
} as const;

// The previous attempt cannot be read: the form is closed. Cancelling it asks
// for a second, explicit confirmation that the result was checked.
export function DamagedAttemptView({
  place,
  to,
  step,
  onAsk,
  onConfirm,
  onBack,
}: {
  place: AttemptPlace;
  to: string;
  step: DiscardStep;
  onAsk: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const asking = step === 'confirm';
  const text =
    step === 'closed'
      ? place.damaged
      : `${place.damaged} ${step === 'confirm' ? place.confirm : stepText[step]}`;
  return (
    <FormMessage
      tone="error"
      title="Новую отправку пока нельзя начать"
      action={
        <>
          <ButtonLink variant="secondary" to={to}>
            {place.link}
          </ButtonLink>
          {asking ? (
            <>
              <Button onClick={onConfirm}>{place.checked}</Button>
              <Button variant="secondary" onClick={onBack}>
                Назад
              </Button>
            </>
          ) : (
            step !== 'refused' && (
              <Button variant="secondary" onClick={onAsk}>
                Отменить прошлую отправку
              </Button>
            )
          )}
        </>
      }
    >
      {text}
    </FormMessage>
  );
}

// The owner of the confirmation: the record is discarded only by the press
// of the confirming button, never by the first one. After a successful
// discard the state turns undamaged and the screen opens its form by itself.
export function DamagedAttempt({
  state,
  place,
}: {
  state: AttemptState;
  place: AttemptPlaceKey;
}) {
  const path = useRestaurantPath();
  const [step, setStep] = useState<DiscardStep>('closed');
  const words = attemptPlaces[place];
  return (
    <DamagedAttemptView
      place={words}
      to={path(words.suffix)}
      step={step}
      onAsk={() => {
        setStep('confirm');
      }}
      onBack={() => {
        setStep('closed');
      }}
      onConfirm={() => {
        const result = state.discardCorrupt();
        setStep(result === 'ok' ? 'closed' : result);
      }}
    />
  );
}
