import { Flex, Text, chakra } from '@chakra-ui/react';
import minusIcon from '@/presentation/assets/icons/minus-24.svg';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import { Icon } from './icon';

const StepButton = chakra(
  'button',
  {
    base: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      w: '10',
      cursor: 'pointer',
      _hover: { bg: 'bg.subtle' },
    },
  },
  { defaultProps: { type: 'button' } },
);

// Figma Stepper in the order panel: «−», portions, «+». The sample order is
// fixed, so the buttons change nothing yet.
export function Stepper({ value, label }: { value: number; label: string }) {
  return (
    <Flex align="center" gap="2">
      <Flex
        h="10"
        borderWidth="1px"
        borderColor="border.strong"
        borderRadius="md"
        overflow="hidden"
      >
        <StepButton aria-label={`Меньше порций: ${label}`}>
          <Icon src={minusIcon} size={20} />
        </StepButton>
        <chakra.output
          display="flex"
          alignItems="center"
          justifyContent="center"
          w="12"
          borderInlineWidth="1px"
          borderColor="border.strong"
          textStyle="body.default"
        >
          {value}
        </chakra.output>
        <StepButton aria-label={`Больше порций: ${label}`}>
          <Icon src={plusIcon} size={20} />
        </StepButton>
      </Flex>
      <Text as="span" textStyle="caption.default" color="text.secondary">
        порц.
      </Text>
    </Flex>
  );
}
