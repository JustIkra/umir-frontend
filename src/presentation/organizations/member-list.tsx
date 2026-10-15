import { Flex, Stack, Text } from '@chakra-ui/react';
import { type RestaurantAccess } from '@/application/access';
import { type Member } from '@/application/organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { ListCard } from '@/presentation/ui/card';
import { rem } from '@/presentation/ui/units';
import { assignmentLines } from './members';

// Figma Member row: a line from 1024, a card on 390. The current user has
// «Это вы» instead of «Открыть»: they do not edit their own access (D7).
export function MemberList({
  members,
  restaurants,
  basePath,
  currentUserID,
}: {
  members: readonly Member[];
  restaurants: readonly RestaurantAccess[];
  basePath: string;
  currentUserID: string | undefined;
}) {
  return (
    <ListCard>
      {members.map((member) => {
        const { membershipID, userID } = member.membership;
        return (
          <Flex
            as="li"
            key={membershipID}
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'flex-start', sm: 'center' }}
            gap="3"
            p="4"
            borderBottomWidth="1px"
            borderColor="border.default"
          >
            <Stack gap="1" flex="1" minW="0">
              <Text textStyle="body.strong" overflowWrap="anywhere">
                {member.displayName}
              </Text>
              <Text
                textStyle="caption.default"
                color="text.secondary"
                overflowWrap="anywhere"
              >
                {member.email ?? 'Почта не указана'}
              </Text>
              <Stack gap="0" textStyle="caption.default" color="text.primary">
                {assignmentLines(member, restaurants).map((line) => (
                  <Text key={line}>{line}</Text>
                ))}
              </Stack>
            </Stack>
            {userID === currentUserID ? (
              <Text
                w={{ sm: rem(200) }}
                textStyle="caption.default"
                color="text.secondary"
              >
                Это вы
              </Text>
            ) : (
              <ButtonLink
                variant="link"
                to={`${basePath}/${membershipID}`}
                aria-label={`Открыть: ${member.displayName}`}
              >
                Открыть
              </ButtonLink>
            )}
          </Flex>
        );
      })}
    </ListCard>
  );
}
