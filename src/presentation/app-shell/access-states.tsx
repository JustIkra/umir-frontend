import alertIcon from '@/presentation/assets/icons/alert-24.svg';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import lockIcon from '@/presentation/assets/icons/lock-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { Button, ButtonLink, TextLink } from '@/presentation/ui/actions';
import { DiagnosticDetails } from '@/presentation/ui/form-message';
import { StateCard } from '@/presentation/ui/states';

// Figma W13: no restaurant in access.
export function NoRestaurants({ onRefresh }: { onRefresh: () => void }) {
  return (
    <StateCard
      icon={userIcon}
      tile="action"
      title="Нет доступных ресторанов"
      actions={
        <>
          <ButtonLink to="/app/organizations/new">
            Создать организацию
          </ButtonLink>
          <Button variant="secondary" onClick={onRefresh}>
            Обновить список
          </Button>
        </>
      }
    >
      У вас пока нет доступа ни к одному ресторану. Попросите администратора
      прислать приглашение на почту — или создайте свою организацию.
    </StateCard>
  );
}

// Figma W14: the restaurant's roles do not include the section.
export function SectionUnavailable({
  section,
  restaurantName,
  overviewPath,
}: {
  section: string;
  restaurantName: string | undefined;
  overviewPath: string;
}) {
  const where =
    restaurantName === undefined
      ? 'в этом ресторане'
      : `в ресторане «${restaurantName}»`;
  return (
    <StateCard
      icon={lockIcon}
      title={`Нет доступа к разделу «${section}»`}
      actions={<ButtonLink to={overviewPath}>Перейти к обзору</ButtonLink>}
    >
      {`У вас нет доступа к этому разделу ${where}. Если он нужен, обратитесь к администратору.`}
    </StateCard>
  );
}

// Figma W15: access to the restaurant ended; its data is hidden.
export function AccessRevoked({
  restaurantName,
}: {
  restaurantName: string | undefined;
}) {
  const target =
    restaurantName === undefined
      ? 'к этому ресторану'
      : `к ресторану «${restaurantName}»`;
  return (
    <StateCard
      icon={lockIcon}
      title="Доступ к ресторану отозван"
      actions={
        <>
          <ButtonLink to="/app">Выбрать другой ресторан</ButtonLink>
          <TextLink to="/app/settings">Открыть аккаунт</TextLink>
        </>
      }
    >
      {`Администратор отозвал ваш доступ ${target}. Мы скрыли данные ресторана, а то, что вы не успели отправить, не сохранилось.`}
    </StateCard>
  );
}

// Figma W16: the restaurant is still registering.
export function RestaurantPreparing({
  restaurantName,
  onRetry,
}: {
  restaurantName: string;
  onRetry: () => void;
}) {
  return (
    <StateCard
      icon={clockIcon}
      title="Ресторан ещё настраивается"
      actions={<Button onClick={onRetry}>Проверить снова</Button>}
    >
      {`${restaurantName ? `Ресторан «${restaurantName}»` : 'Ресторан'} создан, мы его ещё настраиваем. Обычно это занимает до минуты.`}
    </StateCard>
  );
}

// Figma W17: /access got no answer. It never means «no access».
export function AccessUnverified({
  details,
  onRetry,
}: {
  details: string;
  onRetry: () => void;
}) {
  return (
    <StateCard
      icon={alertIcon}
      title="Не удалось загрузить рестораны"
      actions={
        <>
          <Button onClick={onRetry}>Попробовать ещё раз</Button>
          <DiagnosticDetails>{details}</DiagnosticDetails>
        </>
      }
    >
      Список не загрузился, но ваш доступ к ресторанам не изменился. Попробуйте
      ещё раз.
    </StateCard>
  );
}

// No frame: GET /me got no answer. Built on W17 (plan ruling 7).
export function SessionUnverified({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard
      icon={alertIcon}
      title="Не удалось проверить вход"
      actions={<Button onClick={onRetry}>Попробовать ещё раз</Button>}
    >
      Входить заново не нужно — просто попробуйте ещё раз.
    </StateCard>
  );
}
