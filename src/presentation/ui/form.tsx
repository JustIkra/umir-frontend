import {
  Box,
  Flex,
  HStack,
  Stack,
  Text,
  chakra,
  type HTMLChakraProps,
  type SystemStyleObject,
} from '@chakra-ui/react';
import { useState, type ReactNode, type Ref } from 'react';
import alertIcon from '@/presentation/assets/icons/alert-16.svg';
import checkDisabledIcon from '@/presentation/assets/icons/check-disabled-16.svg';
import checkIcon from '@/presentation/assets/icons/check-on-action-16.svg';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import eyeOffIcon from '@/presentation/assets/icons/eye-off-24.svg';
import eyeIcon from '@/presentation/assets/icons/eye-24.svg';
import lockIcon from '@/presentation/assets/icons/lock-24.svg';
import searchIcon from '@/presentation/assets/icons/search-24.svg';
import { Icon } from './icon';
import { sanitizeQuantity } from './masks';
import { rem } from './units';

// Figma Field 117:1418: label, control, then a hint or an error that says what
// to fix. Error text replaces the hint and is linked through aria-describedby.
export function FieldMessage({
  id,
  error,
  hint,
  live,
  indent = false,
}: {
  id: string;
  error?: string | undefined;
  hint?: ReactNode;
  live?: boolean;
  indent?: boolean;
}) {
  if (error) {
    return (
      <Flex id={id} gap="1" align="flex-start" pl={indent ? '10' : undefined}>
        <Icon src={alertIcon} size={16} mt="0.5" />
        <Text textStyle="caption.default" color="text.error">
          {error}
        </Text>
      </Flex>
    );
  }
  if (!hint) return null;
  return (
    <Text
      id={id}
      aria-live={live ? 'polite' : undefined}
      textStyle="caption.default"
      color="text.secondary"
    >
      {hint}
    </Text>
  );
}

export function FieldLabel({
  htmlFor,
  id,
  children,
}: {
  htmlFor: string;
  id?: string | undefined;
  children: ReactNode;
}) {
  return (
    <chakra.label htmlFor={htmlFor} id={id} textStyle="caption.strong">
      {children}
    </chakra.label>
  );
}

const controlStyles = (invalid: boolean) =>
  ({
    w: 'full',
    bg: invalid ? 'bg.errorSubtle' : 'bg.surface',
    borderWidth: invalid ? '2px' : '1px',
    borderColor: invalid ? 'border.error' : 'border.strong',
    borderRadius: 'md',
    color: 'text.primary',
    textStyle: 'body.default',
    _placeholder: { color: 'text.secondary' },
    _readOnly: {
      bg: 'bg.subtle',
      borderColor: 'border.default',
      color: 'text.disabled',
    },
  }) as const;

// Figma Input 117:1393: 44px high, the value stays when it is invalid.
export function TextInput({
  invalid = false,
  ...props
}: {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
} & HTMLChakraProps<'input'>) {
  return (
    <chakra.input
      {...controlStyles(invalid)}
      h="2.75rem"
      px={invalid ? 'calc({spacing.3} - 1px)' : '3'}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

// Figma Textarea 201:3185: min-height, never a fixed height, so the field
// grows with enlarged text spacing (ГОСТ Р 52872, WCAG 1.4.12). Browsers
// without field-sizing get a vertical resize handle instead.
export function TextArea({
  invalid = false,
  ...props
}: {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
} & HTMLChakraProps<'textarea'>) {
  return (
    <chakra.textarea
      {...controlStyles(invalid)}
      display="block"
      minH="8.75rem"
      px={invalid ? 'calc({spacing.3} - 1px)' : '3'}
      py={invalid ? 'calc(0.625rem - 1px)' : '2.5'}
      resize="none"
      css={{
        fieldSizing: 'content',
        '@supports not (field-sizing: content)': { resize: 'vertical' },
      }}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

// Figma Checkbox 201:3174: a native checkbox inside the label, so the whole
// row toggles it; the hit area is 28px. labelCss can hide the text visually
// where a column head already names the box.
export function CheckboxField({
  id,
  label,
  labelCss,
  invalid = false,
  disabled = false,
  ...props
}: {
  id: string;
  label: ReactNode;
  labelCss?: SystemStyleObject;
  invalid?: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
} & HTMLChakraProps<'input'>) {
  return (
    <chakra.label
      htmlFor={id}
      display="flex"
      gap="3"
      alignItems="flex-start"
      cursor={disabled ? 'default' : 'pointer'}
    >
      <Flex boxSize="7" flexShrink="0" align="center" justify="center">
        <chakra.input
          id={id}
          type="checkbox"
          appearance="none"
          boxSize="5"
          m="0"
          flexShrink="0"
          bgColor={invalid ? 'bg.errorSubtle' : 'bg.surface'}
          borderWidth={invalid ? '2px' : '1.5px'}
          borderColor={invalid ? 'border.error' : 'border.strong'}
          borderRadius="sm"
          bgRepeat="no-repeat"
          bgPos="center"
          bgSize="1rem"
          cursor="inherit"
          _checked={{
            bgColor: 'bg.action',
            borderWidth: '1.5px',
            borderColor: 'bg.action',
            bgImage: `url("${checkIcon}")`,
          }}
          _disabled={{
            bgColor: 'bg.subtle',
            borderColor: 'border.default',
            _checked: {
              bgColor: 'bg.subtle',
              borderColor: 'border.default',
              bgImage: `url("${checkDisabledIcon}")`,
            },
          }}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          {...props}
        />
      </Flex>
      <Text
        as="span"
        flex="1"
        textStyle="body.default"
        color={disabled ? 'text.disabled' : 'text.primary'}
        css={labelCss}
      >
        {label}
      </Text>
    </chakra.label>
  );
}

// Figma Password input: 44px high, a 40px toggle inside the right edge. The
// toggle only switches visibility; the value never leaves the field.
export function PasswordInput({
  id,
  invalid = false,
  ...props
}: {
  id: string;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
} & HTMLChakraProps<'input'>) {
  const [shown, setShown] = useState(false);
  return (
    <Flex
      align="center"
      gap="1"
      h="2.75rem"
      pl={invalid ? 'calc({spacing.3} - 1px)' : '3'}
      pr={invalid ? 'calc({spacing.0.5} - 1px)' : '0.5'}
      bg={invalid ? 'bg.errorSubtle' : 'bg.surface'}
      borderWidth={invalid ? '2px' : '1px'}
      borderColor={invalid ? 'border.error' : 'border.strong'}
      borderRadius="md"
      _focusWithin={{
        outline: '2px solid {colors.border.focus}',
        outlineOffset: '2px',
      }}
    >
      <chakra.input
        id={id}
        type={shown ? 'text' : 'password'}
        flex="1"
        minW="0"
        h="full"
        bg="transparent"
        textStyle="body.default"
        color="text.primary"
        _focusVisible={{ outline: 'none' }}
        aria-invalid={invalid || undefined}
        {...props}
      />
      <chakra.button
        type="button"
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize="10"
        borderRadius="sm"
        cursor="pointer"
        aria-label="Показать пароль"
        aria-controls={id}
        aria-pressed={shown}
        onClick={() => {
          setShown((value) => !value);
        }}
      >
        <Icon src={shown ? eyeOffIcon : eyeIcon} size={24} />
      </chakra.button>
    </Flex>
  );
}

// Figma Code field 444:3520: one 56px box for the six digits, pasted whole
// (no length limit: the email shows the code as «482 913»);
// the digits are monospaced, the «6 цифр» placeholder uses the body font.
export function CodeInput({
  id,
  ...props
}: { id: string; ref?: Ref<HTMLInputElement> } & HTMLChakraProps<'input'>) {
  return (
    <chakra.input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      placeholder="6 цифр"
      w="full"
      h="3.5rem"
      px="4"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="md"
      color="text.primary"
      textStyle="mono.code"
      _placeholder={{
        textStyle: 'body.default',
        letterSpacing: '0',
        color: 'text.secondary',
      }}
      {...props}
    />
  );
}

// Figma Read-only value: a label, a grey row with a 16px lock and the value,
// then a note.
export function ReadOnlyValue({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Stack gap="1">
      <Text textStyle="caption.strong">{label}</Text>
      <HStack
        gap="2"
        px="3"
        py="2.5"
        bg="bg.subtle"
        borderRadius="md"
        textStyle="body.default"
        color="text.primary"
      >
        <Icon src={lockIcon} size={16} />
        <Text as="span" minW="0" overflowWrap="anywhere">
          {value}
        </Text>
      </HStack>
      <Text textStyle="caption.default" color="text.secondary">
        {note}
      </Text>
    </Stack>
  );
}

// Figma Search field 80:605: 48px with a search icon. The placeholder names
// the search, aria-label repeats it for screen readers.
export function SearchInput({
  label,
  ...props
}: { label: string } & HTMLChakraProps<'input'>) {
  return (
    <Flex
      align="center"
      flexShrink="0"
      gap="2"
      h="12"
      px="calc({spacing.4} - 1px)"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="md"
      _focusWithin={{
        outline: '2px solid {colors.border.focus}',
        outlineOffset: '2px',
      }}
    >
      <Icon src={searchIcon} size={24} />
      <chakra.input
        type="search"
        aria-label={label}
        placeholder={label}
        flex="1"
        minW="0"
        h="full"
        bg="transparent"
        textStyle="body.default"
        color="text.primary"
        _placeholder={{ color: 'text.secondary' }}
        _focusVisible={{ outline: 'none' }}
        {...props}
        // Search is for show: Enter must not submit an enclosing form, such as
        // NE01 around the zone list.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
    </Flex>
  );
}

// Figma Select (P1, K14): a native <select> styled as Input 117:1393 with a
// chevron. The placeholder is a disabled first option; without one the first
// option is chosen («дней» in P1).
export function SelectField({
  placeholder,
  options,
  invalid = false,
  ...props
}: {
  placeholder?: string;
  invalid?: boolean;
  options: readonly { value: string; label: string }[];
} & HTMLChakraProps<'select'>) {
  return (
    <Box position="relative" w="full">
      <chakra.select
        {...controlStyles(invalid)}
        appearance="none"
        h="2.75rem"
        pl={invalid ? 'calc({spacing.3} - 1px)' : '3'}
        pr="10"
        cursor="pointer"
        defaultValue={
          placeholder === undefined || props.value !== undefined
            ? undefined
            : ''
        }
        aria-invalid={invalid || undefined}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </chakra.select>
      <Icon
        src={chevronIcon}
        size={24}
        position="absolute"
        top="50%"
        right="3"
        transform="translateY(-50%)"
        pointerEvents="none"
      />
    </Box>
  );
}

// Figma Radio 641:4290 in a fieldset whose legend names the group (K05):
// options in a row from 768, one under another with 44px rows on 390.
export function RadioGroupField({
  legend,
  name,
  options,
  hint,
  hintId,
  error,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  hint?: string;
  hintId?: string;
  error?: string | undefined;
  // Controlled use: without value and onChange the browser keeps the choice.
  value?: string | undefined;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <chakra.fieldset
      border="0"
      p="0"
      m="0"
      aria-describedby={hintId}
      disabled={disabled}
    >
      <chakra.legend textStyle="caption.strong" mb={{ base: '1', sm: '3' }}>
        {legend}
      </chakra.legend>
      <Flex direction={{ base: 'column', sm: 'row' }} wrap="wrap" columnGap="6">
        {options.map((option) => (
          <chakra.label
            key={option.value}
            display="flex"
            alignItems="center"
            gap="2.5"
            py={{ base: '2.5', sm: '0.5' }}
            cursor="pointer"
            textStyle="body.default"
          >
            <chakra.input
              type="radio"
              name={name}
              value={option.value}
              {...(value === undefined
                ? {}
                : { checked: value === option.value })}
              onChange={() => {
                onChange?.(option.value);
              }}
              appearance="none"
              boxSize="5"
              m="0"
              flexShrink="0"
              bg="bg.surface"
              borderWidth="1.5px"
              borderColor="border.strong"
              borderRadius="full"
              cursor="inherit"
              _checked={{ borderWidth: '6px', borderColor: 'bg.action' }}
            />
            {option.label}
          </chakra.label>
        ))}
      </Flex>
      {hintId !== undefined && (hint !== undefined || error !== undefined) && (
        <Box mt={{ base: '1', sm: '3' }}>
          <FieldMessage id={hintId} hint={hint} error={error} />
        </Box>
      )}
    </chakra.fieldset>
  );
}

// Figma date and time fields: text inputs with «дд.мм.гггг» and «чч:мм»; the
// service validates Moscow time, the browser does not pick dates.
export function DateInput(
  props: { ref?: Ref<HTMLInputElement> } & HTMLChakraProps<'input'>,
) {
  return (
    <TextInput
      inputMode="numeric"
      placeholder="дд.мм.гггг"
      w={rem(156)}
      flexShrink="0"
      {...props}
    />
  );
}

export function TimeInput(
  props: { ref?: Ref<HTMLInputElement> } & HTMLChakraProps<'input'>,
) {
  return (
    <TextInput
      inputMode="numeric"
      placeholder="чч:мм"
      w={rem(96)}
      flexShrink="0"
      {...props}
    />
  );
}

// Figma quantity field: a number with its unit inside the right edge.
export function QuantityInput({
  unit,
  invalid = false,
  ...props
}: { unit: string; invalid?: boolean } & HTMLChakraProps<'input'>) {
  return (
    <Flex
      align="center"
      gap="2"
      h="2.75rem"
      px={invalid ? 'calc({spacing.3} - 1px)' : '3'}
      bg={invalid ? 'bg.errorSubtle' : 'bg.surface'}
      borderWidth={invalid ? '2px' : '1px'}
      borderColor={invalid ? 'border.error' : 'border.strong'}
      borderRadius="md"
      _focusWithin={{
        outline: '2px solid {colors.border.focus}',
        outlineOffset: '2px',
      }}
    >
      <chakra.input
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        placeholder="0"
        flex="1"
        minW="0"
        bg="transparent"
        textStyle="body.default"
        color="text.primary"
        _placeholder={{ color: 'text.secondary' }}
        _focusVisible={{ outline: 'none' }}
        {...props}
        onChange={(event) => {
          const clean = sanitizeQuantity(event.currentTarget.value);
          if (clean !== event.currentTarget.value) {
            event.currentTarget.value = clean;
          }
          props.onChange?.(event);
        }}
      />
      <Text as="span" textStyle="body.default" color="text.secondary">
        {unit}
      </Text>
    </Flex>
  );
}

export function FieldGroup({ children }: { children: ReactNode }) {
  return <Stack gap="1">{children}</Stack>;
}
