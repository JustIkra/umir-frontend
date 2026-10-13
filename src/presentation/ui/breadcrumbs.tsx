import { Flex, Text, chakra } from '@chakra-ui/react';
import { TextLink } from './actions';

// Figma breadcrumbs (P1, K05, K13, K14). Items without a page are plain text;
// the last item is the current page. On 390 only the parent link stays, as a
// way back.
export function Breadcrumbs({
  items,
}: {
  items: readonly { title: string; to?: string }[];
}) {
  const parent = items.findLastIndex((item) => item.to !== undefined);
  return (
    <chakra.nav aria-label="Навигационная цепочка">
      <Flex
        as="ol"
        wrap="wrap"
        columnGap="2"
        rowGap="1"
        listStyleType="none"
        textStyle="caption.default"
        color="text.secondary"
      >
        {items.map((item, index) => (
          <Flex
            as="li"
            key={item.title}
            display={{ base: index === parent ? 'flex' : 'none', sm: 'flex' }}
            color={{ base: 'text.action', sm: 'text.secondary' }}
            align="center"
            gap="2"
          >
            {index > 0 && (
              <chakra.span
                aria-hidden="true"
                display={{ base: 'none', sm: 'inline' }}
              >
                /
              </chakra.span>
            )}
            {item.to ? (
              <TextLink to={item.to} size="caption" color="inherit">
                {item.title}
              </TextLink>
            ) : (
              <Text
                as="span"
                color={index === items.length - 1 ? 'text.primary' : undefined}
                aria-current={index === items.length - 1 ? 'page' : undefined}
              >
                {item.title}
              </Text>
            )}
          </Flex>
        ))}
      </Flex>
    </chakra.nav>
  );
}
