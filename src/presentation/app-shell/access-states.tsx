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
            Создать предприятие
          </ButtonLink>
          <Button variant="secondary" onClick={onRefresh}>
            Обновить список
          </Button>
        </>
      }
    >
      Учётная запись не связана ни с одним рестораном. Доступ предоставляет
      администратор организации: приглашение приходит на почту. Также можно
      создать собственное предприятие.
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
      title={`Раздел «${section}» недоступен`}
      actions={<ButtonLink to={overviewPath}>Перейти к обзору</ButtonLink>}
    >
      {`Роли ${where} не включают доступ к этому разделу. Доступ назначает администратор организации.`}
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
          <TextLink to="/app/settings">Открыть учётную запись</TextLink>
        </>
      }
    >
      {`Администратор организации отозвал доступ ${target}. Данные ресторана скрыты, незавершённые формы не отправлены.`}
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
      title="Ресторан подготавливается"
      actions={<Button onClick={onRetry}>Проверить снова</Button>}
    >
      {`Ресторан «${restaurantName}» создан, рабочее пространство ещё не готово. Подготовка обычно занимает до минуты.`}
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
      title="Доступ не проверен"
      actions={
        <>
          <Button onClick={onRetry}>Повторить проверку</Button>
          <DiagnosticDetails>{details}</DiagnosticDetails>
        </>
      }
    >
      Сервис авторизации не отвечает, поэтому список ресторанов не получен. Это
      не означает, что доступов нет.
    </StateCard>
  );
}

// No frame: GET /me got no answer. Built on W17 (plan ruling 7).
export function SessionUnverified({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard
      icon={alertIcon}
      title="Сессия не проверена"
      actions={<Button onClick={onRetry}>Повторить проверку</Button>}
    >
      Сервис авторизации не отвечает, поэтому вход не удалось проверить. Это не
      означает, что сессия завершена.
    </StateCard>
  );
}
