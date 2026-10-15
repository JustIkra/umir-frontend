import { Flex, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';
import type { RestaurantAccess } from '@/application/access';
import type { InvitationRow as Row } from '@/application/organizations';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { grantsLine, invitationDates, invitationStatus } from './invitations';

function InvitationItem({
  row,
  restaurants,
  timeZone,
  invitePath,
  busy,
  onCancel,
  onResend,
}: {
  row: Row;
  restaurants: readonly RestaurantAccess[];
  timeZone: string;
  invitePath: string;
  // A resend or a cancellation of the row has no known outcome yet.
  busy: boolean;
  onCancel: (row: Row) => void;
  onResend: (row: Row) => void;
}) {
  const emailId = useId();
  const { invitation } = row;
  const status = invitationStatus(row);
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
        <Text textStyle="caption.default">
          {grantsLine(invitation.assignments, restaurants)}
        </Text>
        <Text textStyle="caption.default" color="text.secondary">
          {invitationDates(row, timeZone)}
        </Text>
      </Stack>
      <Stack
        gap={{ base: '3', sm: '2' }}
        align={{ base: 'flex-start', sm: 'flex-end' }}
      >
        <Badge tone={status.tone}>{status.label}</Badge>
        {status.actions.includes('resend') && (
          <Button
            variant="secondary"
            disabled={busy}
            aria-describedby={emailId}
            onClick={() => {
              onResend(row);
            }}
          >
            Отправить ссылку повторно
          </Button>
        )}
        {status.actions.includes('cancel') && (
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            aria-describedby={emailId}
            onClick={() => {
              onCancel(row);
            }}
          >
            Отменить приглашение
          </Button>
        )}
        {status.actions.includes('reinvite') && (
          <ButtonLink
            variant="secondary"
            to={`${invitePath}?from=${invitation.invitationID}`}
            aria-describedby={emailId}
          >
            Пригласить повторно
          </ButtonLink>
        )}
      </Stack>
    </Flex>
  );
}

// Figma Invitation row: a line from 1024, a card on 390. The roles are named
// per restaurant of access; the buttons follow the status of the invitation.
export function InvitationList({
  rows,
  restaurants,
  timeZone,
  invitePath,
  busy,
  onCancel,
  onResend,
}: {
  rows: readonly Row[];
  restaurants: readonly RestaurantAccess[];
  timeZone: string;
  invitePath: string;
  busy: (invitationID: string) => boolean;
  onCancel: (row: Row) => void;
  onResend: (row: Row) => void;
}) {
  return (
    <ListCard>
      {rows.map((row) => (
        <InvitationItem
          key={row.invitation.invitationID}
          row={row}
          restaurants={restaurants}
          timeZone={timeZone}
          invitePath={invitePath}
          busy={busy(row.invitation.invitationID)}
          onCancel={onCancel}
          onResend={onResend}
        />
      ))}
    </ListCard>
  );
}
