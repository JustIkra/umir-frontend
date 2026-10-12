import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useId, useState, type ReactNode } from 'react';
import alertIcon from '@/presentation/assets/icons/alert-24.svg';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import chevronDownIcon from '@/presentation/assets/icons/chevron-down-16.svg';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import { Icon } from './icon';

const tones = {
  error: {
    bg: 'bg.errorSubtle',
    border: 'border.error',
    icon: alertIcon,
    role: 'alert',
  },
  success: {
    bg: 'bg.actionSubtle',
    border: 'border.action',
    icon: checkIcon,
    role: 'status',
  },
  unknown: {
    bg: 'bg.subtle',
    border: 'border.strong',
    icon: clockIcon,
    role: 'alert',
  },
} as const;

// Figma Diagnostic details 147:1833: for support only, focus stays on the
// toggle and the content appears without a height animation.
function DiagnosticDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <Stack gap="1">
      <chakra.button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        display="inline-flex"
        alignSelf="flex-start"
        alignItems="center"
        gap="1"
        px="1.5"
        py="1"
        borderRadius="sm"
        textStyle="caption.strong"
        color="text.secondary"
        cursor="pointer"
      >
        Подробности для поддержки
        <Icon
          src={chevronDownIcon}
          size={16}
          transform={open ? 'rotate(180deg)' : undefined}
        />
      </chakra.button>
      <Text
        id={contentId}
        hidden={!open}
        px="1.5"
        textStyle="mono.default"
        color="text.secondary"
      >
        {children}
      </Text>
    </Stack>
  );
}

// Figma Form message 147:1929. Error and Unknown are assertive alerts; Success
// is a polite status. Unknown never promises success or failure.
export function FormMessage({
  tone,
  title,
  children,
  action,
  details,
}: {
  tone: keyof typeof tones;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  details?: string | undefined;
}) {
  const style = tones[tone];
  return (
    <Flex
      role={style.role}
      gap="3"
      align="flex-start"
      px="4"
      py="3"
      bg={style.bg}
      borderWidth="1px"
      borderColor={style.border}
      borderRadius="md"
      css={{ animation: 'fadeIn {durations.base} {easings.enter} both' }}
    >
      <Icon src={style.icon} size={24} />
      <Stack flex="1" minW="0" gap="2">
        <Box textStyle="body.default">
          <Text textStyle="body.strong">{title}</Text>
          {children && <Text mt="0.5">{children}</Text>}
        </Box>
        {action && (
          <Flex wrap="wrap" gap="2">
            {action}
          </Flex>
        )}
        {details && <DiagnosticDetails>{details}</DiagnosticDetails>}
      </Stack>
    </Flex>
  );
}
