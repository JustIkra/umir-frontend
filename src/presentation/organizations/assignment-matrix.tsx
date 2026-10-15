import { Flex, Stack, Text, type SystemStyleObject } from '@chakra-ui/react';
import {
  type RestaurantAccess,
  type StaffRoleName,
} from '@/application/access';
import { type RoleGrant } from '@/application/organizations';
import { media } from '@/presentation/theme/system';
import { CheckboxField } from '@/presentation/ui/form';
import { rem } from '@/presentation/ui/units';
import { toggleRole } from './members';

const columns: readonly {
  role: StaffRoleName;
  title: string;
  key: string;
}[] = [
  { role: 'Warehouse', title: 'Склад', key: 'warehouse' },
  { role: 'Waiter', title: 'Официант', key: 'waiter' },
];

// From 1024 the column heads name the roles, so the labels next to the boxes
// are hidden visually but stay for screen readers.
const hiddenFromSm: SystemStyleObject = {
  [media.sm]: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
};

// Figma Assignment matrix (MM01, IV01): one row per restaurant with «Склад»
// and «Официант». Each row is a group named by the restaurant, so a box reads
// as «На Береговой, Склад». The matrix is controlled: value holds the roles of
// every restaurant and onChange hears the next value of one box.
//
// changed: the restaurants that show «Изменено» (MM02). A preparing
// restaurant carries «Готовится — доступ откроется после подготовки»; readyOnly
// leaves such a row unavailable (the invitation is refused for it).
export function AssignmentMatrix({
  id,
  restaurants,
  value,
  onChange,
  disabled = false,
  changed,
  readyOnly = false,
}: {
  id: string;
  restaurants: readonly RestaurantAccess[];
  value: readonly RoleGrant[];
  onChange: (next: readonly RoleGrant[]) => void;
  disabled?: boolean;
  changed?: ReadonlySet<string>;
  readyOnly?: boolean;
}) {
  return (
    <Stack gap="2">
      <Flex
        aria-hidden="true"
        display={{ base: 'none', sm: 'flex' }}
        gap="3"
        px="3"
        py="1"
        textStyle="caption.strong"
        color="text.secondary"
      >
        <Text as="span" flex="1">
          Ресторан
        </Text>
        {columns.map((column) => (
          <Text as="span" key={column.key} w={rem(96)} textAlign="center">
            {column.title}
          </Text>
        ))}
      </Flex>
      <Stack gap="1">
        {restaurants.map((restaurant, index) => {
          const nameId = `${id}-${String(index)}`;
          const preparing = restaurant.lifecycle === 'registering';
          const marked = changed?.has(restaurant.restaurantID) ?? false;
          const roles =
            value.find(
              (grant) => grant.restaurantID === restaurant.restaurantID,
            )?.roles ?? [];
          return (
            <Flex
              key={restaurant.restaurantID}
              role="group"
              aria-labelledby={nameId}
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'stretch', sm: 'center' }}
              gap={{ base: '2', sm: '3' }}
              p="3"
              borderRadius="md"
              bg={marked ? 'bg.actionSubtle' : undefined}
            >
              <Stack gap="1" flex="1" minW="0">
                <Text id={nameId} textStyle="body.default">
                  {restaurant.name}
                </Text>
                {preparing && (
                  <Text textStyle="caption.default" color="text.secondary">
                    Готовится — доступ откроется после подготовки
                  </Text>
                )}
                {marked && (
                  <Text textStyle="caption.strong" color="text.action">
                    Изменено
                  </Text>
                )}
              </Stack>
              <Flex gap={{ base: '4', sm: '3' }}>
                {columns.map((column) => (
                  <Flex
                    key={column.key}
                    flex={{ base: '1', sm: 'none' }}
                    w={{ sm: rem(96) }}
                    justify={{ base: 'flex-start', sm: 'center' }}
                  >
                    <CheckboxField
                      id={`${nameId}-${column.key}`}
                      label={column.title}
                      labelCss={hiddenFromSm}
                      checked={roles.includes(column.role)}
                      disabled={disabled || (readyOnly && preparing)}
                      onChange={(event) => {
                        onChange(
                          toggleRole(
                            value,
                            restaurant.restaurantID,
                            column.role,
                            event.currentTarget.checked,
                          ),
                        );
                      }}
                    />
                  </Flex>
                ))}
              </Flex>
            </Flex>
          );
        })}
      </Stack>
      <Text textStyle="caption.default" color="text.secondary">
        «Склад» — приём поставок, справочники, остатки и подтверждение списания.
        <br />
        «Официант» — заказы, меню и рекомендации.
      </Text>
    </Stack>
  );
}
