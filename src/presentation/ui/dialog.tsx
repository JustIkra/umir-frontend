import { Flex, Stack, chakra, type SystemStyleObject } from '@chakra-ui/react';
import {
  useId,
  type SyntheticEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { media, scrim } from '@/presentation/theme/system';
import { rem } from './units';

// A modal <dialog>: the browser traps focus, closes on Esc and returns focus to
// the opener. A click on the backdrop (the dialog box itself) closes it too.
// The browser paints dialog text CanvasText (black), so the theme colour is set.
export function Dialog({
  dialogRef,
  label,
  labelledBy,
  css,
  locked = false,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  locked?: boolean;
  label?: string | undefined;
  labelledBy?: string | undefined;
  css: SystemStyleObject;
  children: ReactNode;
}) {
  return (
    <chakra.dialog
      ref={dialogRef}
      aria-label={label}
      aria-labelledby={labelledBy}
      p="0"
      m="0"
      border="0"
      bg="transparent"
      color="text.primary"
      maxW="100vw"
      maxH="100dvh"
      onCancel={(event) => {
        if (locked) event.preventDefault();
      }}
      onClick={(event) => {
        if (!locked && event.target === event.currentTarget)
          event.currentTarget.close();
      }}
      css={css}
    >
      {children}
    </chakra.dialog>
  );
}

// Figma dialogs RS01, RV01 and CX01: a card in the middle of the screen, a
// bottom sheet with stacked buttons on 390. The content sits in a
// method="dialog" form, so a submit button or Enter in a field closes it. The
// first button gets the initial focus, so the safe action goes first. A dialog
// that must stay open until a command is answered passes onSubmit, which
// prevents the closing and decides.
export function ModalPanel({
  dialogRef,
  title,
  width,
  children,
  actions,
  locked = false,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  locked?: boolean;
  onSubmit?: (event: SyntheticEvent<HTMLFormElement>) => void;
  title: string;
  width: number;
  children: ReactNode;
  actions: ReactNode;
}) {
  const titleId = useId();
  return (
    <Dialog
      dialogRef={dialogRef}
      labelledBy={titleId}
      locked={locked}
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
          width: rem(width),
          height: 'fit-content',
        },
      }}
    >
      <Stack
        asChild
        gap="4"
        py="6"
        px={{ base: '4', sm: '6' }}
        bg="bg.surface"
        borderTopRadius={{ base: 'xl', sm: 'md' }}
        borderBottomRadius={{ base: '0', sm: 'md' }}
        boxShadow="overlay"
      >
        <form method="dialog" noValidate onSubmit={onSubmit}>
          <chakra.h2 id={titleId} textStyle="heading.h2">
            {title}
          </chakra.h2>
          {children}
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            justify="flex-end"
            gap="2"
          >
            {actions}
          </Flex>
        </form>
      </Stack>
    </Dialog>
  );
}
