import type { components } from '@/adapters/api/backend-v2';
import { decoded } from '@/adapters/api/decode/common';
import { decodeFeedbackSaved } from '@/adapters/api/decode/feedback';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import { failureOf } from '@/application/api';
import type { FeedbackOutcome, FeedbackSender } from '@/application/feedback';
import { feedbackConsentVersion } from '@/domain/feedback';

export const anonymousFeedbackPath = '/api/v2/feedback/anonymous';

const savedAnswer = decoded(decodeFeedbackSaved, 'unknown');
const defaultWaitSeconds = 60;

function outcomeOf(error: unknown): FeedbackOutcome {
  const failure = failureOf(error);
  if (failure === undefined) throw error;
  if (failure.outcome === 'unknown') return { kind: 'unknown' };
  if (failure.status === 429) {
    return {
      kind: 'rateLimited',
      retryAfterSeconds: failure.retryAfterSeconds ?? defaultWaitSeconds,
    };
  }
  // The contract names only the email among the form's fields.
  if (failure.fieldErrors.email !== undefined) {
    return { kind: 'invalid', fieldErrors: { email: 'InvalidFormat' } };
  }
  return {
    kind: 'unavailable',
    diagnostics: `${String(failure.status)} ${failure.code}`,
  };
}

// The contact form (umir-feedback#1): the landing posts to the anonymous
// endpoint, the app to the one of a restaurant. The submitter repeats the same
// submissionID after an unknown outcome, so the service stores it once.
export function createFeedbackApiSender(
  client: Pick<GatewayClient, 'send'>,
  path: string = anonymousFeedbackPath,
): FeedbackSender {
  return {
    async send({ submissionID, draft }) {
      const phone = draft.phone.trim();
      const body: components['schemas']['FeedbackSubmission'] = {
        submissionID,
        name: draft.name.trim(),
        email: draft.email.trim(),
        ...(phone === '' ? {} : { phone }),
        message: draft.message.trim(),
        consent: { accepted: true, documentVersion: feedbackConsentVersion },
        website: draft.website,
      };
      try {
        savedAnswer(await client.send('POST', path, { body }));
        return { kind: 'sent' };
      } catch (error) {
        return outcomeOf(error);
      }
    },
  };
}
