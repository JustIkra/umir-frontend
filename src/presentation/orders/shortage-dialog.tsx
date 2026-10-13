import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useNavigate } from 'react-router';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import { shortage } from '@/presentation/placeholder-orders';
import { media, scrim } from '@/presentation/theme/system';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Dialog } from '@/presentation/ui/dialog';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';

// Groups are divided by a line; the first follows the stamp without one.
function Group({
  title,
  first = false,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <Stack
      gap="2"
      pt={first ? '0' : '4'}
      borderTopWidth={first ? '0' : '1px'}
      borderColor="border.default"
    >
      <chakra.h3 textStyle="caption.strong" color="text.secondary">
        {title}
      </chakra.h3>
      {children}
    </Stack>
  );
}

function Position({
  title,
  text,
  badge,
}: {
  title: string;
  text: string;
  badge: ReactNode;
}) {
  return (
    <Flex justify="space-between" align="flex-start" gap="3">
      <Stack gap="0.5">
        <Text textStyle="body.strong">{title}</Text>
        <Text textStyle="body.default">{text}</Text>
      </Stack>
      {badge}
    </Flex>
  );
}

const cell = {
  display: { base: 'block', sm: 'table-cell' },
  p: { base: '0', sm: '0' },
  py: { sm: '2' },
  borderBottomWidth: { base: '0', sm: '1px' },
  borderColor: 'border.default',
} as const;

const head = {
  pb: '2',
  textStyle: 'caption.default',
  color: 'text.secondary',
  fontWeight: 'inherit',
  borderBottomWidth: '1px',
  borderColor: 'border.strong',
  verticalAlign: 'bottom',
} as const;

// Figma «Не хватает ингредиентов»: a table from 768; on 390 every row reads
// «Поз. 2 Филе лосося / нужно 360 г · доступно для позиции 220 г».
function MissingTable() {
  return (
    <chakra.table w="full" borderCollapse="collapse" textStyle="body.default">
      <chakra.thead display={{ base: 'none', sm: 'table-header-group' }}>
        <tr>
          <chakra.th {...head} textAlign="start" w={rem(60)}>
            Поз.
          </chakra.th>
          <chakra.th {...head} textAlign="start">
            Ингредиент
          </chakra.th>
          <chakra.th {...head} textAlign="end">
            Нужно
          </chakra.th>
          <chakra.th {...head} textAlign="end" w={rem(120)}>
            Доступно для позиции
          </chakra.th>
        </tr>
      </chakra.thead>
      <tbody>
        {shortage.missing.map((row) => (
          <chakra.tr
            key={row.position}
            display={{ base: 'grid', sm: 'table-row' }}
            gridTemplateAreas="'position ingredient ingredient ingredient' 'need need available available'"
            gridTemplateColumns="auto auto auto 1fr"
            alignItems="baseline"
            columnGap="2"
            rowGap="1"
            py={{ base: '2', sm: '0' }}
            borderBottomWidth={{ base: '1px', sm: '0' }}
            borderColor="border.default"
          >
            <chakra.td
              {...cell}
              gridArea="position"
              textStyle="caption.default"
              color="text.secondary"
            >
              {row.position}
            </chakra.td>
            <chakra.td {...cell} gridArea="ingredient">
              {row.ingredient}
            </chakra.td>
            <chakra.td
              {...cell}
              gridArea="need"
              textAlign={{ sm: 'end' }}
              textStyle="mono.body"
              whiteSpace="nowrap"
            >
              <chakra.span
                display={{ sm: 'none' }}
                textStyle="caption.default"
                color="text.secondary"
              >
                нужно{' '}
              </chakra.span>
              {row.need}
            </chakra.td>
            <chakra.td
              {...cell}
              gridArea="available"
              textAlign={{ sm: 'end' }}
              textStyle="mono.body"
              whiteSpace="nowrap"
            >
              <chakra.span
                display={{ sm: 'none' }}
                textStyle="caption.default"
                color="text.secondary"
              >
                · доступно для позиции{' '}
              </chakra.span>
              {row.available}
            </chakra.td>
          </chakra.tr>
        ))}
      </tbody>
    </chakra.table>
  );
}

// Figma Shortage dialog 88:1948 (04): opens with the page; focus starts on the
// heading so the change is read first. The body scrolls, the total and the
// actions stay at the bottom; on 390 it is a bottom sheet (05).
export function ShortageDialog({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const navigate = useNavigate();
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    title.current?.focus();
  }, [dialogRef]);
  return (
    <Dialog
      dialogRef={dialogRef}
      labelledBy={titleId}
      css={{
        position: 'fixed',
        insetInline: '0',
        insetBlockEnd: '0',
        insetBlockStart: 'auto',
        width: '100%',
        '&::backdrop': { background: scrim },
        [media.sm]: {
          insetBlock: '0',
          margin: 'auto',
          width: rem(640),
          height: 'fit-content',
        },
      }}
    >
      <Flex
        direction="column"
        maxH={{
          base: `calc(100dvh - ${rem(40)})`,
          sm: `calc(100dvh - ${rem(140)})`,
        }}
        bg="bg.surface"
        borderTopRadius={{ base: 'xl', sm: 'md' }}
        borderBottomRadius={{ base: '0', sm: 'md' }}
        boxShadow="overlay"
        overflow="hidden"
      >
        <Stack
          gap="4"
          px={{ base: '4', sm: '6' }}
          pt={{ base: '5', sm: '6' }}
          pb="4"
          overflowY="auto"
        >
          <Stack gap="2">
            <chakra.h2
              ref={title}
              id={titleId}
              tabIndex={-1}
              textStyle="heading.h2"
              _focusVisible={{ outline: 'none' }}
            >
              Не весь заказ можно приготовить
            </chakra.h2>
            <Text textStyle="body.default" color="text.secondary">
              Блюда используют общие ингредиенты, поэтому часть заказа
              сократилась. Подтвердите итоговый состав.
            </Text>
            <Flex
              align="center"
              gap="1"
              textStyle="caption.default"
              color="text.secondary"
            >
              <Icon src={clockIcon} size={16} />
              {shortage.stamp}
            </Flex>
          </Stack>
          <Group title="Что изменилось" first>
            {shortage.changed.map((item) => (
              <Position
                key={item.title}
                title={item.title}
                text={item.text}
                badge={<Badge>Сокращено</Badge>}
              />
            ))}
          </Group>
          <Group title="Исключённые позиции">
            {shortage.excluded.map((item) => (
              <Position
                key={item.title}
                title={item.title}
                text={item.text}
                badge={<Badge tone="error">Исключено</Badge>}
              />
            ))}
          </Group>
          <Group title="Не хватает ингредиентов">
            <MissingTable />
            <Text textStyle="caption.default" color="text.secondary">
              Доступное количество учитывает позиции выше по порядку заказа.
            </Text>
          </Group>
          <Group title={shortage.finalTitle}>
            {shortage.finalLines.map((line) => (
              <Flex key={line.title} justify="space-between" gap="3">
                <Text textStyle="body.default">{line.title}</Text>
                <Text textStyle="mono.body" flexShrink="0">
                  {line.portions}
                </Text>
              </Flex>
            ))}
            <Text textStyle="caption.default" color="text.secondary">
              При оформлении склад проверит состав ещё раз.
            </Text>
          </Group>
        </Stack>
        <Stack
          gap="3"
          px={{ base: '4', sm: '6' }}
          py="4"
          bg="bg.canvas"
          borderTopWidth="1px"
          borderColor="border.default"
        >
          <Text textStyle="body.strong">{shortage.total}</Text>
          <Flex direction={{ base: 'column', sm: 'row' }} gap="3">
            <Button
              onClick={() => {
                void navigate('/app/orders/placed');
              }}
            >
              Оформить оставшиеся блюда
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate('/app/orders/draft');
              }}
            >
              Вернуться к изменению заказа
            </Button>
          </Flex>
        </Stack>
      </Flex>
    </Dialog>
  );
}
