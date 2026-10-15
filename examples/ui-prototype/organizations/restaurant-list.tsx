import { Flex, Stack, Text } from '@chakra-ui/react';
import { type Restaurant } from '../placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { rolesLine } from './format';

// Figma Restaurant row: name and roles, then the status and «Открыть» in one
// line from 1024 and stacked on 390. A preparing restaurant cannot be opened.
export function RestaurantList({
  restaurants,
}: {
  restaurants: readonly Restaurant[];
}) {
  return (
    <Stack as="ul" gap="4" listStyleType="none">
      {restaurants.map((restaurant) => (
        <Flex
          as="li"
          key={restaurant.name}
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'center' }}
          gap="3"
          p="4"
          borderBottomWidth="1px"
          borderColor="border.default"
        >
          <Stack gap="1" flex="1" minW="0">
            <Text textStyle="body.strong">{restaurant.name}</Text>
            <Text textStyle="caption.default" color="text.secondary">
              {rolesLine(restaurant)}
            </Text>
          </Stack>
          {restaurant.preparing ? (
            <Badge>Подготавливается</Badge>
          ) : (
            <>
              <Badge tone="success">Готов к работе</Badge>
              <ButtonLink
                variant="link"
                to="/app"
                aria-label={`Открыть: ${restaurant.name}`}
              >
                Открыть
              </ButtonLink>
            </>
          )}
        </Flex>
      ))}
    </Stack>
  );
}
