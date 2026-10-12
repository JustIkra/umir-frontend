import type { LoadOptions } from '@/application/read-model';

// Gateway's public header: a background read validates the session without
// extending it. Only the exact value "background" has meaning.
export const activityHeader = 'X-Umir-Activity';

// Options for a GET through gateway. Reads after a live signal or tick are
// background; reads the operator caused send no activity header.
export function readRequestInit({ background }: LoadOptions): RequestInit {
  return {
    method: 'GET',
    headers: background ? { [activityHeader]: 'background' } : {},
  };
}
