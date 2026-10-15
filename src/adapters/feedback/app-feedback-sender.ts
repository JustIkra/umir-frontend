import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { FeedbackSender } from '@/application/feedback';
import { createFeedbackApiSender } from './feedback-api-sender';

export const appFeedbackPath = (restaurantID: string) =>
  `/api/v2/r/${encodeURIComponent(restaurantID)}/feedback`;

// The feedback form inside the app (needs the session of the restaurant):
// the same body and the same outcomes as the landing form.
export function createAppFeedbackApiSender(
  client: Pick<GatewayClient, 'send'>,
  restaurantID: string,
): FeedbackSender {
  return createFeedbackApiSender(client, appFeedbackPath(restaurantID));
}
