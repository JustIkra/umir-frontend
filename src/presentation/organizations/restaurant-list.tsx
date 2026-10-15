import { Flex, Stack, Text } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { type RestaurantAccess } from '@/application/access';
import { type FollowedOperation } from '@/application/lifecycles';
import { orgKeys } from '@/application/organization-commands';
import { type Role } from '@/domain/access';
import { useServices } from '@/presentation/services';
import { useAttempts, useStore } from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { DeleteRestaurantDialog } from './delete-restaurant-dialog';
import { DeletionNotice } from './deletion-notice';
import { rolesLine } from './format';
import { useRestaurantDeletion } from './use-deletion';

// The preparation of this restaurant that stopped waiting (RS07).
function stalledPreparation(
  operations: readonly FollowedOperation[],
  restaurant: RestaurantAccess,
): FollowedOperation | undefined {
  return operations.find(
    (operation) =>
      operation.kind === 'create-restaurant' &&
      operation.status === 'stalled' &&
      operation.lifecycle.restaurantIDs.includes(restaurant.restaurantID),
  );
}

// The administrator's role is not listed per restaurant while it prepares:
// access gives the role of a ready restaurant only.
function rolesOf(restaurant: RestaurantAccess, admin: boolean): Role[] {
  if (restaurant.roles.length > 0) return [...restaurant.roles];
  return admin ? ['Admin'] : [];
}

// Figma Restaurant row: name and roles, then the status and «Открыть» in one
// line from 1024 and stacked on 390. A preparing restaurant cannot be opened;
// one whose preparation stalled (RS07) offers to watch it again. The
// administrator also deletes a restaurant from its row; a deletion whose
// answer was lost is checked here as well.
function RestaurantRow({
  restaurant,
  admin,
  onDeleted,
}: {
  restaurant: RestaurantAccess;
  admin: boolean;
  onDeleted: ((name: string) => void) | undefined;
}) {
  const { organizations } = useServices();
  const { commands, lifecycles } = organizations;
  const operations = useStore(lifecycles);
  useAttempts();
  const dialog = useRef<HTMLDialogElement>(null);
  // The deletion was accepted: the row goes with the next read of access.
  const [deleted, setDeleted] = useState(false);
  const deletion = useRestaurantDeletion(restaurant, (name) => {
    setDeleted(true);
    onDeleted?.(name);
  });
  const stalled =
    restaurant.lifecycle === 'registering'
      ? stalledPreparation(operations, restaurant)
      : undefined;
  const roles = rolesOf(restaurant, admin);
  const unsettled = commands.isUnsettled(
    orgKeys.deleteRestaurant(restaurant.restaurantID),
  );
  const deleteState =
    deletion.stored.kind === 'deleting' || deletion.stored.kind === 'done'
      ? deletion.stored
      : unsettled
        ? { kind: 'unknown' as const }
        : deletion.stored;
  return (
    <Stack
      as="li"
      gap="3"
      p="4"
      borderBottomWidth="1px"
      borderColor="border.default"
    >
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'flex-start', sm: 'center' }}
        gap="3"
      >
        <Stack gap="1" flex="1" minW="0">
          <Text textStyle="body.strong" overflowWrap="anywhere">
            {restaurant.name}
          </Text>
          {roles.length > 0 && (
            <Text textStyle="caption.default" color="text.secondary">
              {rolesLine(roles)}
            </Text>
          )}
          {stalled && (
            <Text textStyle="caption.default" color="text.secondary">
              Рабочее пространство ресторана не подготовлено.
            </Text>
          )}
        </Stack>
        {stalled ? (
          <>
            <Badge tone="error">Подготовка не завершена</Badge>
            <Button
              variant="secondary"
              onClick={() => {
                lifecycles.retry(stalled.operationID);
              }}
            >
              Повторить подготовку
            </Button>
          </>
        ) : restaurant.lifecycle === 'ready' ? (
          <>
            <Badge tone="success">Готов к работе</Badge>
            <ButtonLink
              variant="link"
              to={`/app/r/${restaurant.restaurantID}`}
              aria-label={`Открыть: ${restaurant.name}`}
            >
              Открыть
            </ButtonLink>
          </>
        ) : (
          <Badge>Подготавливается</Badge>
        )}
        {admin &&
          (deleted || deleteState.kind === 'done' ? (
            <Badge>Удаляется</Badge>
          ) : (
            <Button
              variant="link"
              aria-haspopup="dialog"
              aria-label={`Удалить: ${restaurant.name}`}
              disabled={deleteState.kind === 'deleting' || unsettled}
              onClick={() => dialog.current?.showModal()}
            >
              Удалить
            </Button>
          ))}
      </Flex>
      {admin && (
        <DeletionNotice
          subject="restaurant"
          name={restaurant.name}
          state={deleteState}
          onCheck={() => {
            void deletion.run();
          }}
        />
      )}
      {admin && (
        <DeleteRestaurantDialog
          dialogRef={dialog}
          restaurant={restaurant}
          onDeleted={(name) => {
            setDeleted(true);
            onDeleted?.(name);
          }}
        />
      )}
    </Stack>
  );
}

export function RestaurantList({
  restaurants,
  admin = false,
  onDeleted,
}: {
  restaurants: readonly RestaurantAccess[];
  admin?: boolean;
  // A deletion of a restaurant was accepted.
  onDeleted?: (name: string) => void;
}) {
  return (
    <Stack as="ul" gap="4" listStyleType="none">
      {restaurants.map((restaurant) => (
        <RestaurantRow
          key={restaurant.restaurantID}
          restaurant={restaurant}
          admin={admin}
          onDeleted={onDeleted}
        />
      ))}
    </Stack>
  );
}
