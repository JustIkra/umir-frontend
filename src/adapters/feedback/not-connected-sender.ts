import type { FeedbackSender } from '@/application/feedback';

// The public endpoint POST /api/feedback (umir-feedback#1, umir-gateway#10) is
// not connected in this build. Every attempt reports the service as
// unavailable, so the visitor keeps the text and nothing pretends to be sent.
export const notConnectedFeedbackSender: FeedbackSender = {
  send: () =>
    Promise.resolve({
      kind: 'unavailable',
      diagnostics: 'POST /api/feedback не подключён в этой сборке интерфейса',
    }),
};
