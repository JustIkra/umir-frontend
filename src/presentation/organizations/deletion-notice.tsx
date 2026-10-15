import { FormMessage } from '@/presentation/ui/form-message';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import { deletionMessage, type DeletionSubject } from './deletion';
import { type DeletionProgress } from './use-deletion';

// What a row or a section says of a deletion outside the dialog: an answer
// that was not received, with «Проверить результат», or the refusal that the
// check brought. The confirmation and the progress are the dialog's.
export function DeletionNotice({
  subject,
  name,
  state,
  onCheck,
}: {
  subject: DeletionSubject;
  name: string;
  state: DeletionProgress;
  onCheck: () => void;
}) {
  if (state.kind === 'done') return null;
  const message = deletionMessage(subject, state, name);
  if (message === undefined) return null;
  return state.kind === 'unknown' ? (
    <UnknownOutcomeAlert title={message.title} onCheck={onCheck}>
      {message.text}
    </UnknownOutcomeAlert>
  ) : (
    <FormMessage tone="error" title={message.title}>
      {message.text}
    </FormMessage>
  );
}
