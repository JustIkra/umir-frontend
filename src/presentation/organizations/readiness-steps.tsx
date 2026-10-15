import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import { Icon } from '@/presentation/ui/icon';

export type ReadinessStage = 'preparing' | 'stalled' | 'ready';

const steps = [
  'Организация создана',
  'Ресторан настраивается',
  'Готово к работе',
] as const;

// Figma NE05: the three steps of a new organization. The organization is
// created at once, the restaurant is prepared after the answer, and the last
// step is reached when the preparation is finished. A stalled preparation
// keeps the second step current.
export function ReadinessSteps({ stage }: { stage: ReadinessStage }) {
  const done = stage === 'ready' ? 3 : 1;
  return (
    <Stack as="ol" gap="3" listStyleType="none" aria-label="Этапы создания">
      {steps.map((title, index) => {
        const finished = index < done;
        const current = index === done;
        return (
          <Flex
            as="li"
            key={title}
            align="center"
            gap="3"
            aria-current={current ? 'step' : undefined}
          >
            <Flex
              boxSize="8"
              flexShrink="0"
              align="center"
              justify="center"
              borderRadius="full"
              borderWidth="2px"
              borderColor={
                finished
                  ? 'border.action'
                  : current
                    ? stage === 'stalled'
                      ? 'border.error'
                      : 'border.focus'
                    : 'border.default'
              }
              bg={finished ? 'bg.actionSubtle' : 'bg.surface'}
              aria-hidden="true"
            >
              {finished ? (
                <Icon src={checkIcon} size={24} />
              ) : (
                <Text textStyle="caption.strong">{String(index + 1)}</Text>
              )}
            </Flex>
            <Text
              textStyle={current ? 'body.strong' : 'body.default'}
              color={finished || current ? 'text.primary' : 'text.secondary'}
            >
              {title}
              <chakra.span srOnly>
                {finished
                  ? ' — выполнено'
                  : current
                    ? stage === 'stalled'
                      ? ' — не получилось'
                      : ' — выполняется'
                    : ''}
              </chakra.span>
            </Text>
          </Flex>
        );
      })}
    </Stack>
  );
}
