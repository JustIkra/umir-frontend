import type { Dish, Product } from '@/application/restaurant';
import { formatQuantity, unitTitles } from '@/domain/quantity';
import { matchesQuery } from '@/presentation/ui/search';
import { formatStamp } from '@/presentation/ui/zones';

const byName = (
  left: { readonly name: string },
  right: { readonly name: string },
) => left.name.localeCompare(right.name, 'ru');

export interface ProductRow {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
}

// K01: alphabetical, searched by name or code.
export function productRows(
  products: readonly Product[],
  query: string,
): readonly ProductRow[] {
  return products
    .filter((product) => matchesQuery(query, product.name, product.productID))
    .map((product) => ({
      code: product.productID,
      name: product.name,
      unit: unitTitles[product.baseUnit],
    }))
    .sort(byName);
}

export interface DishRow {
  readonly code: string;
  readonly name: string;
}

// K12: the full catalog, including dishes unavailable now.
export function dishRows(
  dishes: readonly Dish[],
  query: string,
): readonly DishRow[] {
  return dishes
    .filter((dish) => matchesQuery(query, dish.name, dish.dishID))
    .map((dish) => ({ code: dish.dishID, name: dish.name }))
    .sort(byName);
}

export interface RecipeRow {
  readonly no: number;
  readonly name: string;
  readonly code: string;
  readonly quantity: string;
}

// K13: one portion; a product missing from the list is shown by its code.
export function recipeRows(
  dish: Dish,
  products: readonly Product[],
): readonly RecipeRow[] {
  const names = new Map(
    products.map((product) => [product.productID, product.name]),
  );
  return dish.ingredients.map((ingredient, index) => ({
    no: index + 1,
    name: names.get(ingredient.productID) ?? ingredient.productID,
    code: ingredient.productID,
    quantity: formatQuantity(ingredient.quantity, ingredient.baseUnit),
  }));
}

export function catalogStamp(epochMs: number, timeZone: string): string {
  return `Данные на ${formatStamp(epochMs, timeZone)}`;
}
