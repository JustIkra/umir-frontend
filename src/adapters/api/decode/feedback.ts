import { object, oneOf } from './common';

// #FeedbackSaved: accepted and duplicate both mean the request is stored.
export function decodeFeedbackSaved(body: unknown): 'accepted' | 'duplicate' {
  const saved = object(body, 'FeedbackSaved');
  object(saved.receipt, 'FeedbackSaved.receipt');
  return oneOf(saved.state, 'FeedbackSaved.state', [
    'accepted',
    'duplicate',
  ] as const);
}
