import { Flex, Text } from '@chakra-ui/react';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import { Button } from './actions';
import { Icon } from './icon';

// Figma Evaluation stamp: when the shown data was computed. «Обновить» does
// nothing until the API is connected.
export function EvaluationStamp({
  text,
  icon = true,
}: {
  text: string;
  icon?: boolean;
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
        {icon && <Icon src={clockIcon} size={16} mt="0.5" />}
        <Text as="span">{text}</Text>
      </Flex>
      <Button variant="link">Обновить</Button>
    </Flex>
  );
}
