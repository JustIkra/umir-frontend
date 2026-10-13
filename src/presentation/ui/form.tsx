import {
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
import eyeOffIcon from '@/presentation/assets/icons/eye-off-24.svg';
import eyeIcon from '@/presentation/assets/icons/eye-24.svg';
import lockIcon from '@/presentation/assets/icons/lock-24.svg';
import searchIcon from '@/presentation/assets/icons/search-24.svg';
import { Icon } from './icon';

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
  ...props
}: { id: string; ref?: Ref<HTMLInputElement> } & HTMLChakraProps<'input'>) {
  const [shown, setShown] = useState(false);
  return (
    <Flex
      align="center"
      gap="1"
      h="2.75rem"
      pl="3"
      pr="0.5"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.strong"
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

// Figma Read-only value: a label, a grey row with a lock and the value, then a
// note. Logins and names are monospaced with a 16px lock; the zone in OG03
// uses the body font and a 24px lock.
export function ReadOnlyValue({
  label,
  value,
  note,
  mono = true,
}: {
  label: string;
  value: string;
  note: string;
  mono?: boolean;
}) {
  return (
    <Stack gap="1">
      <Text textStyle="caption.strong">{label}</Text>
      <HStack
        gap="2"
        px="3"
        py={mono ? '2.5' : '2'}
        bg="bg.subtle"
        borderRadius="md"
        textStyle={mono ? 'mono.body' : 'body.default'}
        color="text.primary"
      >
        <Icon src={lockIcon} size={mono ? 16 : 24} />
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
      />
    </Flex>
  );
}

export function FieldGroup({ children }: { children: ReactNode }) {
  return <Stack gap="1">{children}</Stack>;
}
