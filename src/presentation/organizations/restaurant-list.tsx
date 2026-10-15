import { Flex, Stack, Text } from '@chakra-ui/react';
import { type RestaurantAccess } from '@/application/access';
import { type FollowedOperation } from '@/application/lifecycles';
import { type Role } from '@/domain/access';
import { useServices } from '@/presentation/services';
import { useStore } from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { rolesLine } from './format';

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
// one whose preparation stalled (RS07) offers to watch it again.
export function RestaurantList({
  restaurants,
  admin = false,
}: {
  restaurants: readonly RestaurantAccess[];
  admin?: boolean;
}) {
  const { organizations } = useServices();
  const operations = useStore(organizations.lifecycles);
  return (
    <Stack as="ul" gap="4" listStyleType="none">
      {restaurants.map((restaurant) => {
        const stalled =
          restaurant.lifecycle === 'registering'
            ? stalledPreparation(operations, restaurant)
            : undefined;
        const roles = rolesOf(restaurant, admin);
        return (
          <Flex
            as="li"
            key={restaurant.restaurantID}
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'flex-start', sm: 'center' }}
            gap="3"
            p="4"
            borderBottomWidth="1px"
            borderColor="border.default"
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
                    organizations.lifecycles.retry(stalled.operationID);
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
          </Flex>
        );
      })}
    </Stack>
  );
}
