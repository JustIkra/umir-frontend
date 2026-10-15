import { Flex, Stack, Text } from '@chakra-ui/react';
import { type Member } from '../placeholder-organizations';
import { ButtonLink } from '@/presentation/ui/actions';
import { ListCard } from '@/presentation/ui/card';
import { rem } from '@/presentation/ui/units';

// Figma Member row: a line from 1024, a card on 390. The administrator has a
// note instead of «Открыть»: their access is not revoked.
export function MemberList({
  members,
  basePath,
}: {
  members: readonly Member[];
  basePath: string;
}) {
  return (
    <ListCard>
      {members.map((member) => (
        <Flex
          as="li"
          key={member.id}
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'center' }}
          gap="3"
          p="4"
          borderBottomWidth="1px"
          borderColor="border.default"
        >
          <Stack gap="1" flex="1" minW="0">
            <Text textStyle="body.strong">{member.name}</Text>
            <Text
              textStyle="caption.default"
              color="text.secondary"
              overflowWrap="anywhere"
            >
              {member.email}
            </Text>
            <Stack gap="0" textStyle="caption.default" color="text.primary">
              {member.assignments.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </Stack>
          </Stack>
          {member.admin ? (
            <Text
              w={{ sm: rem(200) }}
              textStyle="caption.default"
              color="text.secondary"
            >
              Доступ администратора организации не отзывается
            </Text>
          ) : (
            <ButtonLink
              variant="link"
              to={`${basePath}/${member.id}`}
              aria-label={`Открыть: ${member.name}`}
            >
              Открыть
            </ButtonLink>
          )}
        </Flex>
      ))}
    </ListCard>
  );
}
