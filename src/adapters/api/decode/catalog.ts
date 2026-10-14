import type {
  CatalogKind,
  Dish,
  DishCatalog,
  DishDetails,
  Ingredient,
  Product,
  Products,
  Suggestion,
} from '@/application/restaurant';
import { baseUnits } from '@/domain/quantity';
import {
  array,
  instant,
  nonEmptyString,
  nonNegativeInt64,
  object,
  oneOf,
  positiveInt64,
  string,
} from './common';

const kinds: readonly CatalogKind[] = ['product', 'dish'];

export function decodeProduct(value: unknown, path: string): Product {
  const product = object(value, path);
  return {
    productID: nonEmptyString(product.productID, `${path}.productID`),
    name: string(product.name, `${path}.name`),
    baseUnit: oneOf(product.baseUnit, `${path}.baseUnit`, baseUnits),
  };
}

export function decodeProducts(value: unknown, path: string): Products {
  const products = object(value, path);
  return {
    evaluatedAt: instant(products.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      products.stateVersion,
      `${path}.stateVersion`,
    ),
    items: array(products.items, `${path}.items`, decodeProduct),
  };
}

function decodeIngredient(value: unknown, path: string): Ingredient {
  const ingredient = object(value, path);
  return {
    productID: nonEmptyString(ingredient.productID, `${path}.productID`),
    quantity: positiveInt64(ingredient.quantity, `${path}.quantity`),
    baseUnit: oneOf(ingredient.baseUnit, `${path}.baseUnit`, baseUnits),
  };
}

export function decodeDish(value: unknown, path: string): Dish {
  const dish = object(value, path);
  return {
    dishID: nonEmptyString(dish.dishID, `${path}.dishID`),
    name: string(dish.name, `${path}.name`),
    ingredients: array(
      dish.ingredients,
      `${path}.ingredients`,
      decodeIngredient,
    ),
  };
}

export function decodeDishCatalog(value: unknown, path: string): DishCatalog {
  const catalog = object(value, path);
  return {
    evaluatedAt: instant(catalog.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      catalog.stateVersion,
      `${path}.stateVersion`,
    ),
    items: array(catalog.items, `${path}.items`, decodeDish),
  };
}

export function decodeDishDetails(value: unknown, path: string): DishDetails {
  const details = object(value, path);
  return {
    evaluatedAt: instant(details.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      details.stateVersion,
      `${path}.stateVersion`,
    ),
    dish: decodeDish(details.dish, `${path}.dish`),
  };
}

export function decodeSuggestion(value: unknown, path: string): Suggestion {
  const suggestion = object(value, path);
  return {
    kind: oneOf(suggestion.kind, `${path}.kind`, kinds),
    suggestedID: nonEmptyString(suggestion.suggestedID, `${path}.suggestedID`),
  };
}
