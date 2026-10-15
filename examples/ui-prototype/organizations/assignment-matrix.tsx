import { Flex, Stack, Text, type SystemStyleObject } from '@chakra-ui/react';
import {
  type Member,
  type Restaurant,
  type Role,
} from '../placeholder-organizations';
import { media } from '@/presentation/theme/system';
import { CheckboxField } from '@/presentation/ui/form';
import { rem } from '@/presentation/ui/units';

const columns: readonly { role: Role; key: string }[] = [
  { role: 'Склад', key: 'warehouse' },
  { role: 'Официант', key: 'waiter' },
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
// as «На Береговой, Склад». The boxes are native and keep no state of ours.
export function AssignmentMatrix({
  id,
  restaurants,
  roles = {},
}: {
  id: string;
  restaurants: readonly Restaurant[];
  roles?: Member['roles'];
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
            {column.role}
          </Text>
        ))}
      </Flex>
      <Stack gap="1">
        {restaurants.map((restaurant, index) => {
          const nameId = `${id}-${String(index)}`;
          return (
            <Flex
              key={restaurant.name}
              role="group"
              aria-labelledby={nameId}
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'stretch', sm: 'center' }}
              gap={{ base: '2', sm: '3' }}
              p="3"
              borderRadius="md"
            >
              <Stack gap="1" flex="1" minW="0">
                <Text id={nameId} textStyle="body.default">
                  {restaurant.name}
                </Text>
                {restaurant.preparing && (
                  <Text textStyle="caption.default" color="text.secondary">
                    Готовится — доступ откроется после подготовки
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
                      label={column.role}
                      labelCss={hiddenFromSm}
                      defaultChecked={
                        roles[restaurant.name]?.includes(column.role) ?? false
                      }
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
