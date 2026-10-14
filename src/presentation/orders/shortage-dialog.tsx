import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { OrderProposal, Product } from '@/application/restaurant';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import { media, scrim } from '@/presentation/theme/system';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Dialog } from '@/presentation/ui/dialog';
import { Icon } from '@/presentation/ui/icon';
import { formatInstant, formatOffset } from '@/presentation/ui/time';
import { rem } from '@/presentation/ui/units';
import {
  acceptanceText,
  changeRows,
  finalText,
  previousRows,
  type ChangeRow,
} from './order-messages';
import { evaluationText } from './order-rows';

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

// One position of the dialog: what was asked, what is left and why.
function ChangeItem({ row }: { row: ChangeRow }) {
  return (
    <Stack gap="1">
      <Position
        title={row.title}
        text={row.text}
        badge={
          <Flex align="center" gap="2" flexShrink="0">
            <Text textStyle="mono.default">{row.change}</Text>
            {row.excluded ? (
              <Badge tone="error">Исключено</Badge>
            ) : (
              <Badge>Сокращено</Badge>
            )}
          </Flex>
        }
      />
    </Stack>
  );
}

// Figma Shortage dialog 88:1948 (04): opens with the page; focus starts on the
// heading so the change is read first. The body scrolls, the total and the
// actions stay at the bottom; on 390 it is a bottom sheet (05).
export function ShortageDialog({
  dialogRef,
  returnFocusRef,
  proposal,
  previous,
  names,
  products,
  timeZone,
  confirming,
  onConfirm,
  onEdit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  proposal: OrderProposal;
  previous: OrderProposal | undefined;
  names: ReadonlyMap<string, string>;
  products: ReadonlyMap<string, Product>;
  timeZone: string;
  confirming: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const rows = changeRows(proposal, names, products);
  const reduced = rows.filter((row) => !row.excluded);
  const excluded = rows.filter((row) => row.excluded);
  const missing = rows.filter((row) => row.deficits.length > 0);
  const before =
    previous === undefined ? [] : previousRows(proposal, previous, names);
  const empty = proposal.acceptedPositions.length === 0;
  const at = proposal.evaluatedAt.epochMs;
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // The native autofocus puts every opening, from the page or from «Проверить
    // и подтвердить», on the heading (React does not render the attribute).
    title.current?.setAttribute('autofocus', '');
    // Opened with the page, the dialog has no opener to return to: focus goes
    // to «Проверить и подтвердить» instead of the start of the page.
    // Focus is then still on the closed heading or already on the body.
    const onClose = () => {
      const active = document.activeElement;
      if (!active || active === document.body || dialog.contains(active))
        returnFocusRef.current?.focus();
    };
    dialog.addEventListener('close', onClose);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('close', onClose);
    };
  }, [dialogRef, returnFocusRef]);
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
              {empty
                ? 'Ни одно блюдо из заказа сейчас нельзя приготовить'
                : previous === undefined
                  ? 'Не весь заказ можно приготовить'
                  : 'Состав снова сокращён'}
            </chakra.h2>
            <Text textStyle="body.default" color="text.secondary">
              {empty
                ? 'Остатки изменились после оценки меню. Измените состав и подготовьте заказ заново.'
                : previous === undefined
                  ? 'Блюда используют общие ингредиенты, поэтому часть заказа сократилась. Подтвердите итоговый состав.'
                  : 'Предыдущее предложение больше не оформляется. Подтвердите новый состав.'}
            </Text>
            {previous !== undefined && (
              <Text textStyle="body.default" color="text.secondary">
                Пока вы подтверждали, доступность снова уменьшилась. Заказ не
                оформлен: склад пересчитал состав в{' '}
                {formatInstant(at, timeZone, 'timeSeconds')}{' '}
                {formatOffset(at, timeZone)}.
              </Text>
            )}
            <Flex
              align="center"
              gap="1"
              textStyle="caption.default"
              color="text.secondary"
            >
              <Icon src={clockIcon} size={16} />
              {evaluationText(at, timeZone)}
            </Flex>
          </Stack>
          <Group title="Что изменилось" first>
            {[...reduced, ...before].map((row) => (
              <ChangeItem key={`${row.lineNo}${row.text}`} row={row} />
            ))}
          </Group>
          {excluded.length > 0 && (
            <Group title="Исключённые позиции">
              {excluded.map((row) => (
                <ChangeItem key={row.lineNo} row={row} />
              ))}
            </Group>
          )}
          {missing.length > 0 && (
            <Group title="Не хватает ингредиентов">
              {missing.map((row) => (
                <Stack key={row.lineNo} gap="0.5">
                  <Text textStyle="caption.strong">{row.title}</Text>
                  {row.deficits.map((deficit) => (
                    <Text key={deficit} textStyle="body.default">
                      {deficit}
                    </Text>
                  ))}
                </Stack>
              ))}
              <Text textStyle="caption.default" color="text.secondary">
                Доступное количество учитывает позиции выше по порядку заказа.
              </Text>
            </Group>
          )}
          <Group title={finalText(proposal)}>
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
          <Text textStyle="body.strong">
            {empty
              ? 'Итоговый состав пуст — оформить заказ нельзя.'
              : acceptanceText(proposal, previous !== undefined)}
          </Text>
          <Flex direction={{ base: 'column', sm: 'row' }} gap="3">
            {!empty && (
              <Button
                disabled={confirming}
                aria-busy={confirming ? 'true' : undefined}
                onClick={onConfirm}
              >
                {confirming
                  ? 'Отправляем подтверждение…'
                  : 'Оформить оставшиеся блюда'}
              </Button>
            )}
            <Button variant="secondary" disabled={confirming} onClick={onEdit}>
              Вернуться к изменению заказа
            </Button>
          </Flex>
        </Stack>
      </Flex>
    </Dialog>
  );
}
