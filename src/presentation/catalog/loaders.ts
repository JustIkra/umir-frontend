import { type LoaderFunctionArgs } from 'react-router';
import { NotFound } from '@/presentation/documents/not-found-page';

// The dish is read by the page itself; the loader only refuses an empty id.
export function dishLoader({ params }: LoaderFunctionArgs) {
  if (!params.dish) throw new NotFound();
  return null;
}
