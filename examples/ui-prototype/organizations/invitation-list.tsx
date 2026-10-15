import { Flex, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';
import {
  type Invitation,
  type InvitationStatus,
} from '../placeholder-organizations';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';

// Badge tones per 2b-1: «Принято» — success, «Ошибка отправки» — error, the
// rest neutral (amber stays for expiry dates). Pending invitations can be
// cancelled; expired, cancelled and failed ones can be sent again.
const statuses: Record<
  InvitationStatus,
  {
    label: string;
    tone: 'neutral' | 'success' | 'error';
    action?: 'cancel' | 'reinvite';
  }
> = {
  queued: { label: 'Принято к отправке', tone: 'neutral', action: 'cancel' },
  delivering: { label: 'Ожидает доставки', tone: 'neutral', action: 'cancel' },
  pending: { label: 'Ожидает принятия', tone: 'neutral', action: 'cancel' },
  accepted: { label: 'Принято', tone: 'success' },
  expired: { label: 'Истекло', tone: 'neutral', action: 'reinvite' },
  cancelled: { label: 'Отменено', tone: 'neutral', action: 'reinvite' },
  failed: { label: 'Ошибка отправки', tone: 'error', action: 'reinvite' },
};

function InvitationRow({
  invitation,
  invitePath,
  onCancel,
}: {
  invitation: Invitation;
  invitePath: string;
  onCancel: (email: string) => void;
}) {
  const emailId = useId();
  const status = statuses[invitation.status];
  return (
    <Flex
      as="li"
      direction={{ base: 'column', sm: 'row' }}
      align={{ base: 'flex-start', sm: 'center' }}
      gap="3"
      p="4"
      borderBottomWidth="1px"
      borderColor="border.default"
    >
      <Stack gap="1" flex="1" minW="0">
        <Text id={emailId} textStyle="body.strong" overflowWrap="anywhere">
          {invitation.email}
        </Text>
        <Text textStyle="caption.default">{invitation.assignments}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {invitation.dates}
        </Text>
      </Stack>
      <Stack
        gap={{ base: '3', sm: '2' }}
        align={{ base: 'flex-start', sm: 'flex-end' }}
      >
        <Badge tone={status.tone}>{status.label}</Badge>
        {status.action === 'cancel' && (
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            aria-describedby={emailId}
            onClick={() => {
              onCancel(invitation.email);
            }}
          >
            Отменить приглашение
          </Button>
        )}
        {status.action === 'reinvite' && (
          <ButtonLink
            variant="secondary"
            to={invitePath}
            aria-describedby={emailId}
          >
            Пригласить повторно
          </ButtonLink>
        )}
      </Stack>
    </Flex>
  );
}

// Figma Invitation row: a line from 1024, a card on 390.
export function InvitationList({
  invitations,
  invitePath,
  onCancel,
}: {
  invitations: readonly Invitation[];
  invitePath: string;
  onCancel: (email: string) => void;
}) {
  return (
    <ListCard>
      {invitations.map((invitation) => (
        <InvitationRow
          key={invitation.email + invitation.status}
          invitation={invitation}
          invitePath={invitePath}
          onCancel={onCancel}
        />
      ))}
    </ListCard>
  );
}
