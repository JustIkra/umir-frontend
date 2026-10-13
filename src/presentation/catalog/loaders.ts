import { type LoaderFunctionArgs } from 'react-router';
import { NotFound } from '@/presentation/documents/not-found-page';
import { findRecipeDish } from '@/presentation/placeholder-catalog';

// Dish pages exist for the sample dishes whose recipe is drawn in Figma.
export function dishLoader({ params }: LoaderFunctionArgs) {
  const dish = findRecipeDish(params.dish);
  if (!dish) throw new NotFound();
  return dish;
}
