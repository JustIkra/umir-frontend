import { Flex, Text } from '@chakra-ui/react';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import { Button } from './actions';
import { Icon } from './icon';

// Figma Evaluation stamp: when the shown data was computed. «Обновить» does
// nothing until the API is connected. icon="narrow" hides the clock from 1201
// (the order menu draws it at 390 and 1024, not at 1440).
export function EvaluationStamp({
  text,
  icon = true,
}: {
  text: string;
  icon?: boolean | 'narrow';
}) {
  return (
    <Flex
      align="center"
      columnGap="2"
      rowGap="1"
      wrap="wrap"
      textStyle="caption.default"
      color="text.secondary"
    >
      <Flex align="flex-start" gap="2" minW="0">
        {icon !== false && (
          <Icon
            src={clockIcon}
            size={16}
            mt="0.5"
            display={icon === 'narrow' ? { xl: 'none' } : undefined}
          />
        )}
        <Text as="span">{text}</Text>
      </Flex>
      <Button variant="link">Обновить</Button>
    </Flex>
  );
}
