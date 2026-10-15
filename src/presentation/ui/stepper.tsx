import { Flex, Text, chakra } from '@chakra-ui/react';
import minusIcon from '@/presentation/assets/icons/minus-24.svg';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import { Icon } from './icon';
import { countValid, sanitizeCount } from './masks';
import { plural } from './plural';

export interface StepperUnit {
  readonly forms: readonly [string, string, string];
  readonly less: string;
  readonly more: string;
  readonly field: string;
}
export const portionsUnit: StepperUnit = {
  forms: ['порция', 'порции', 'порций'],
  less: 'Меньше порций',
  more: 'Больше порций',
  field: 'Порции',
};
export const daysUnit: StepperUnit = {
  forms: ['день', 'дня', 'дней'],
  less: 'Меньше дней',
  more: 'Больше дней',
  field: 'Дни',
};

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

// Figma Stepper: «−», the field, «+» and the unit agreeing with the number.
// The field takes digits only and keeps what was typed (E11 shows the error of
// an invalid value); «−» and «+» step a valid number by 1 down to 1, «+» on an
// invalid one gives 1. With a name the field posts its value in a form.
export function Stepper({
  value,
  label,
  unit = portionsUnit,
  id,
  name,
  invalid = false,
  disabled = false,
  onChange,
}: {
  value: string;
  label: string;
  unit?: StepperUnit;
  id?: string;
  name?: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const valid = countValid(value);
  const step = (by: bigint) => {
    if (!valid) {
      if (by > 0n) onChange('1');
      return;
    }
    const next = BigInt(value.trim()) + by;
    if (next >= 1n) onChange(next.toString());
  };
  const [one, few, many] = unit.forms;
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
          aria-label={`${unit.less}: ${label}`}
          disabled={disabled}
          onClick={() => {
            step(-1n);
          }}
        >
          <Icon src={minusIcon} size={20} />
        </StepButton>
        <chakra.input
          id={id}
          name={name}
          value={value}
          inputMode="numeric"
          aria-label={`${unit.field}: ${label}`}
          aria-invalid={invalid ? 'true' : undefined}
          disabled={disabled}
          onChange={(event) => {
            onChange(sanitizeCount(event.target.value));
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
          aria-label={`${unit.more}: ${label}`}
          disabled={disabled}
          onClick={() => {
            step(1n);
          }}
        >
          <Icon src={plusIcon} size={20} />
        </StepButton>
      </Flex>
      <Text as="span" textStyle="caption.default" color="text.secondary">
        {valid ? plural(value.trim(), one, few, many) : many}
      </Text>
    </Flex>
  );
}
