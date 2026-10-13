import { Flex, Stack, Text } from '@chakra-ui/react';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import {
  menu,
  menuStamp,
  recommendations,
  recommendationsNote,
  stopList,
} from '@/presentation/placeholder-orders';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { Tabs } from '@/presentation/ui/tabs';

const rowStyles = {
  px: '4',
  py: '3',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  _last: { borderBottomWidth: '0' },
} as const;

// Figma «Добавить»: a 40px secondary button with a teal plus.
function AddLink({ dish }: { dish: string }) {
  return (
    <ButtonLink
      variant="secondary"
      to="/app/orders/draft"
      px="calc({spacing.3} - 1px)"
      py="calc({spacing.2} - 1px)"
      aria-label={`Добавить: ${dish}`}
    >
      <MaskIcon src={plusIcon} size={20} />
      Добавить
    </ButtonLink>
  );
}

// Figma 01/02 «Меню»: every «Добавить» opens the sample draft (02).
function MenuList({ draft }: { draft: boolean }) {
  return (
    <ListCard p="0">
      {menu.map((item) => (
        <Flex
          as="li"
          key={item.dish}
          align="center"
          justify="space-between"
          gap="4"
          minH="16"
          {...rowStyles}
        >
          <Stack gap="0.5" minW="0">
            <Text textStyle="body.default">{item.dish}</Text>
            {draft && item.inDraft && (
              <Flex
                align="center"
                gap="1"
                textStyle="caption.default"
                color="text.action"
              >
                <Icon src={checkIcon} size={16} />
                {item.inDraft}
              </Flex>
            )}
          </Stack>
          <AddLink dish={item.dish} />
        </Flex>
      ))}
    </ListCard>
  );
}

// Figma E03 «Стоп-лист».
function StopList() {
  return (
    <ListCard p="0">
      {stopList.map((item) => (
        <Flex
          as="li"
          key={item.dish}
          align="flex-start"
          justify="space-between"
          gap="4"
          {...rowStyles}
        >
          <Stack gap="1" minW="0">
            <Text textStyle="body.default">{item.dish}</Text>
            {item.reasons.map((reason) => (
              <Text
                key={reason}
                textStyle="caption.default"
                color="text.secondary"
              >
                {reason}
              </Text>
            ))}
          </Stack>
          <Badge tone="error">Недоступно</Badge>
        </Flex>
      ))}
    </ListCard>
  );
}

// Figma E05 «Рекомендации для персонала».
function Recommendations() {
  return (
    <ListCard p="0">
      {recommendations.map((item) => (
        <Flex
          as="li"
          key={item.rank}
          align="flex-start"
          justify="space-between"
          gap="4"
          {...rowStyles}
          py="4"
        >
          <Stack gap="2" minW="0">
            <Stack gap="0.5">
              <Text textStyle="body.strong">{`${String(item.rank)}. ${item.dish}`}</Text>
              <Text textStyle="caption.default" color="text.secondary">
                {item.nearest}
              </Text>
            </Stack>
            {item.reasons.map((reason) => (
              <Stack
                key={reason.batch}
                gap="1"
                ps="3"
                py="0.5"
                borderStartWidth="2px"
                borderColor="text.secondary"
              >
                <Text textStyle="caption.strong">{reason.batch}</Text>
                <Flex align="center" gap="2" wrap="wrap">
                  <Text textStyle="mono.default" color="text.secondary">
                    {reason.perPortion}
                  </Text>
                  <Badge tone="expiry">{reason.expires}</Badge>
                </Flex>
              </Stack>
            ))}
          </Stack>
          <AddLink dish={item.dish} />
        </Flex>
      ))}
      <Flex
        as="li"
        align="center"
        justify="space-between"
        wrap="wrap"
        columnGap="4"
        rowGap="1"
        px="4"
        py="3"
        bg="bg.canvas"
      >
        <Text
          flex="1"
          minW="0"
          textStyle="caption.default"
          color="text.secondary"
        >
          {recommendationsNote}
        </Text>
        <Button variant="link" flexShrink="0">
          Показать все
        </Button>
      </Flex>
    </ListCard>
  );
}

// Figma 01, E03, E05: «Меню», «Стоп-лист», «Рекомендации» with the menu stamp
// beside the tabs. The tab panels follow the tab row in the page stack.
export function MenuTabs({ draft }: { draft: boolean }) {
  return (
    <Tabs
      label="Меню"
      extra={<EvaluationStamp text={menuStamp} icon="narrow" />}
      tabs={[
        {
          id: 'menu',
          title: `Меню · ${String(menu.length)}`,
          content: <MenuList draft={draft} />,
        },
        {
          id: 'stop',
          title: `Стоп-лист · ${String(stopList.length)}`,
          content: <StopList />,
        },
        {
          id: 'recommended',
          title: 'Рекомендации · 9',
          content: <Recommendations />,
        },
      ]}
    />
  );
}
