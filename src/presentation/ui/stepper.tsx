import { Flex, Text, chakra } from '@chakra-ui/react';
import minusIcon from '@/presentation/assets/icons/minus-24.svg';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import { portionsValid } from '@/domain/order-draft';
import { Icon } from './icon';
import { plural } from './plural';

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
      _disabled: { cursor: 'not-allowed', opacity: '0.5', bg: 'transparent' },
    },
  },
  { defaultProps: { type: 'button' } },
);

// Figma Stepper in the order panel: «−», the portions field, «+» and «порции»
// agreeing with the number. The field keeps what was typed (E11 shows the
// error of an invalid value); «−» and «+» step a valid number by 1 down to 1,
// «+» on an invalid one gives 1.
export function Stepper({
  value,
  label,
  invalid = false,
  disabled = false,
  onChange,
}: {
  value: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const valid = portionsValid(value);
  const step = (by: bigint) => {
    if (!valid) {
      if (by > 0n) onChange('1');
      return;
    }
    const next = BigInt(value.trim()) + by;
    if (next >= 1n) onChange(next.toString());
  };
  return (
    <Flex align="center" gap="2">
      <Flex
        h="10"
        borderWidth="1px"
        borderColor={invalid ? 'border.error' : 'border.strong'}
        borderRadius="md"
        overflow="hidden"
      >
        <StepButton
          aria-label={`Меньше порций: ${label}`}
          disabled={disabled}
          onClick={() => {
            step(-1n);
          }}
        >
          <Icon src={minusIcon} size={20} />
        </StepButton>
        <chakra.input
          value={value}
          inputMode="numeric"
          aria-label={`Порции: ${label}`}
          aria-invalid={invalid ? 'true' : undefined}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          w="14"
          textAlign="center"
          borderInlineWidth="1px"
          borderColor={invalid ? 'border.error' : 'border.strong'}
          bg="transparent"
          textStyle="body.default"
          _disabled={{ opacity: '0.5' }}
        />
        <StepButton
          aria-label={`Больше порций: ${label}`}
          disabled={disabled}
          onClick={() => {
            step(1n);
          }}
        >
          <Icon src={plusIcon} size={20} />
        </StepButton>
      </Flex>
      <Text as="span" textStyle="caption.default" color="text.secondary">
        {valid ? plural(value.trim(), 'порция', 'порции', 'порций') : 'порций'}
      </Text>
    </Flex>
  );
}
