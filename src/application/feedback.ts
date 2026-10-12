import {
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackFieldErrors,
} from '@/domain/feedback';

export type FeedbackOutcome =
  | { kind: 'sent' }
  | { kind: 'invalid'; fieldErrors: FeedbackFieldErrors }
  | { kind: 'rateLimited'; retryAfterSeconds: number }
  | { kind: 'unavailable'; diagnostics?: string }
  | { kind: 'unknown' };

export interface FeedbackSubmission {
  submissionID: string;
  draft: FeedbackDraft;
}

export interface FeedbackSender {
  send(submission: FeedbackSubmission): Promise<FeedbackOutcome>;
}

export interface FeedbackSubmitter {
  submit(draft: FeedbackDraft): Promise<FeedbackOutcome>;
}

const sameDraft = (left: FeedbackDraft, right: FeedbackDraft) =>
  left.name === right.name &&
  left.email === right.email &&
  left.phone === right.phone &&
  left.message === right.message &&
  left.consent === right.consent &&
  left.website === right.website;

// One submissionID per attempt: sending the same text again reuses it, so the
// service returns the original result instead of storing a second request.
// A changed text or a confirmed send starts a new attempt.
export function createFeedbackSubmitter(
  sender: FeedbackSender,
  newSubmissionId: () => string,
): FeedbackSubmitter {
  let attempt: FeedbackSubmission | undefined;
  return {
    async submit(draft) {
      const fieldErrors = validateFeedbackDraft(draft);
      if (Object.keys(fieldErrors).length > 0) {
        return { kind: 'invalid', fieldErrors };
      }
      if (!attempt || !sameDraft(attempt.draft, draft)) {
        attempt = { submissionID: newSubmissionId(), draft };
      }
      const outcome = await sender.send(attempt);
      if (outcome.kind === 'sent') attempt = undefined;
      return outcome;
    },
  };
}
