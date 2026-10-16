import type {
  DishInput,
  Product,
  ProductInput,
} from '@/application/restaurant';
import {
  baseUnits,
  formatThousandths,
  parseQuantity,
  unitShort,
  unitTitles,
  type BaseUnit,
  type QuantityError,
} from '@/domain/quantity';
import {
  attemptRefusalText,
  serviceUnavailableText,
} from '@/presentation/ui/attempt-messages';
import { listText, plural } from '@/presentation/ui/plural';

export interface ProductDraft {
  readonly name: string;
  readonly code: string;
  readonly unit: BaseUnit | undefined;
}

export type ProductErrors = Partial<Record<'name' | 'code' | 'unit', string>>;

export function productErrors({
  name,
  code,
  unit,
}: ProductDraft): ProductErrors {
  const errors: ProductErrors = {};
  if (name.trim() === '') errors.name = 'Введите название';
  if (code.trim() === '') errors.code = 'Введите код продукта';
  if (unit === undefined) errors.unit = 'Выберите единицу измерения';
  return errors;
}

export interface RecipeLineDraft {
  readonly key: number;
  readonly productID: string;
  readonly quantity: string;
}

export interface DishDraft {
  readonly name: string;
  readonly code: string;
  readonly lines: readonly RecipeLineDraft[];
}

export interface DishErrors {
  readonly fields: Partial<Record<'name' | 'code' | 'recipe', string>>;
  readonly lines: ReadonlyMap<number, string>;
}

export function quantityErrorText(
  error: QuantityError,
  unit: BaseUnit | undefined,
): string {
  switch (error) {
    case 'required':
      return 'Введите количество на порцию';
    case 'format':
      return 'Введите число, например 0,5';
    case 'precision':
      return `Укажите количество с точностью до 0,001\u00a0${unitShort(unit ?? 'g')}.`;
    case 'zero':
      return 'Количество должно быть больше нуля';
  }
}

export function dishErrors(
  { name, code, lines }: DishDraft,
  products: readonly Product[],
): DishErrors {
  const fields: DishErrors['fields'] = {};
  if (name.trim() === '') fields.name = 'Введите название';
  if (code.trim() === '') fields.code = 'Введите код блюда';
  if (lines.length === 0) {
    fields.recipe =
      'Добавьте хотя бы один ингредиент: блюдо без рецепта создать нельзя.';
  }
  const byID = new Map(products.map((product) => [product.productID, product]));
  const firstLine = new Map<string, number>();
  const errors = new Map<number, string>();
  lines.forEach((line, index) => {
    if (line.productID === '') {
      errors.set(line.key, 'Выберите продукт');
      return;
    }
    const product = byID.get(line.productID);
    const earlier = firstLine.get(line.productID);
    if (earlier !== undefined) {
      errors.set(
        line.key,
        `${product?.name ?? line.productID} уже есть в строке ${String(earlier)}. Измените количество там, а эту строку удалите.`,
      );
      return;
    }
    firstLine.set(line.productID, index + 1);
    const parsed = parseQuantity(line.quantity);
    if (!parsed.ok)
      errors.set(line.key, quantityErrorText(parsed.error, product?.baseUnit));
  });
  return { fields, lines: errors };
}

const kept = 'Ничего не сохранено, данные остались в форме.';

export function fieldsSummary(
  count: number,
  withRecipe: boolean,
): { readonly title: string; readonly text: string } {
  return {
    title: `Проверьте ${String(count)} ${plural(count, 'поле', 'поля', 'полей')}`,
    text: withRecipe
      ? `Мы отметили ошибки у полей и в рецепте. ${kept}`
      : `Мы отметили ошибки у полей. ${kept}`,
  };
}

export function linesSummary(lineNos: readonly number[]): {
  readonly title: string;
  readonly text: string;
} {
  if (lineNos.length === 1) {
    return {
      title: 'Проверьте 1 строку',
      text: `Мы отметили ошибку в строке ${listText(lineNos)}. ${kept}`,
    };
  }
  const count = lineNos.length;
  return {
    title: `Блюдо не создано: ошибки в ${String(count)} ${plural(count, 'строке', 'строках', 'строках')}`,
    text: `Мы отметили ошибки в строках ${listText(lineNos)}. ${kept}`,
  };
}

export function conflictText(
  kind: 'product' | 'dish',
  code: string,
  name: string | undefined,
): string {
  if (name === undefined) return `Код ${code} уже занят. Укажите другой код.`;
  const owner = kind === 'product' ? 'продуктом' : 'блюдом';
  return `Код ${code} уже занят ${owner} «${name}». Укажите другой код.`;
}

export function createdProductText(
  name: string,
  code: string,
  unit: BaseUnit,
): { readonly title: string; readonly text: string } {
  const unitName = unitTitles[unit].split(',')[0] ?? unitTitles[unit];
  return {
    title: `Продукт «${name}» создан`,
    text: `Код ${code}, единица — ${unitName}. Продукт уже можно выбрать в поставках и рецептах. Изменить его после создания нельзя.`,
  };
}

export function createdDishText(
  name: string,
  code: string,
  ingredients: number,
): { readonly title: string; readonly text: string } {
  return {
    title: `Блюдо «${name}» создано`,
    text: `Код ${code}, ${String(ingredients)} ${plural(ingredients, 'ингредиент', 'ингредиента', 'ингредиентов')} на порцию. Можно ли заказать блюдо сейчас, видно в меню в разделе «Заказы».`,
  };
}

export function outcomeMessage(
  kind: 'product' | 'dish',
  outcome: 'unknown' | 'reset' | 'invalid' | 'refused',
  // The code of a refusal: a saved attempt that blocks the create says so.
  code?: string,
): { readonly title: string; readonly text: string } {
  const product = kind === 'product';
  const notCreated = product ? 'Продукт не создан' : 'Блюдо не создано';
  const unknownTitle = product
    ? 'Не знаем, создан ли продукт'
    : 'Не знаем, создано ли блюдо';
  switch (outcome) {
    case 'unknown':
      return {
        title: unknownTitle,
        text: product
          ? 'Связь прервалась. Нажмите «Проверить результат» — второй продукт не появится.'
          : 'Связь прервалась. Нажмите «Проверить результат» — второе блюдо не появится.',
      };
    case 'reset':
      return {
        title: unknownTitle,
        text: `Мы не можем подтвердить результат: данные на сервере обновились. Откройте список и проверьте, ${product ? 'появился ли продукт' : 'появилось ли блюдо'}.`,
      };
    case 'invalid':
      return {
        title: notCreated,
        text: `Проверьте поля и попробуйте ещё раз. ${kept}`,
      };
    case 'refused':
      return {
        title: notCreated,
        text:
          (code === 'ServiceUnavailable'
            ? serviceUnavailableText
            : code === undefined
              ? undefined
              : attemptRefusalText(code, product ? 'products' : 'dishes')) ??
          'Не получилось сохранить. Данные остались в форме — попробуйте ещё раз.',
      };
  }
}

// The footer line of a create form. After a reset no result will come, so
// nothing says the fields wait for one.
export function footerCaption(
  kind: 'product' | 'dish',
  status: string,
): string | undefined {
  if (status === 'sending') {
    return kind === 'product'
      ? 'Создаём продукт. Повторное нажатие не создаст дубль.'
      : 'Создаём блюдо. Повторное нажатие не создаст дубль.';
  }
  if (status === 'unknown') {
    return 'Пока вы не проверите результат, поля менять нельзя.';
  }
  if (status === 'reset') return undefined;
  return 'Если в форме ошибка, мы подскажем — ничего не сохранится.';
}

// What a create form hands to the list or the recipe page it returns to
// (K09, K21) through the router state.
export type CreatedNotice =
  | {
      readonly kind: 'product';
      readonly name: string;
      readonly code: string;
      readonly unit: BaseUnit;
    }
  | {
      readonly kind: 'dish';
      readonly name: string;
      readonly code: string;
      readonly ingredients: number;
    };

export function createdNoticeOf(state: unknown): CreatedNotice | undefined {
  if (typeof state !== 'object' || state === null || !('created' in state)) {
    return undefined;
  }
  const created: unknown = state.created;
  if (typeof created !== 'object' || created === null) return undefined;
  const { kind, name, code } = created as Record<string, unknown>;
  if (typeof name !== 'string' || typeof code !== 'string') return undefined;
  const { unit, ingredients } = created as Record<string, unknown>;
  if (kind === 'product' && baseUnits.some((known) => known === unit)) {
    return { kind, name, code, unit: unit as BaseUnit };
  }
  if (kind === 'dish' && typeof ingredients === 'number') {
    return { kind, name, code, ingredients };
  }
  return undefined;
}

// A create whose outcome is unknown keeps its input in the command runner; a
// page that mounts again copies it back into the fields.
export function productDraftOf({
  productID,
  name,
  baseUnit,
}: ProductInput): ProductDraft {
  return { name, code: productID, unit: baseUnit };
}

export function dishDraftOf({
  dishID,
  name,
  ingredients,
}: DishInput): DishDraft {
  return {
    name,
    code: dishID,
    lines: ingredients.map((ingredient, index) => ({
      key: index + 1,
      productID: ingredient.productID,
      quantity: formatThousandths(ingredient.quantity),
    })),
  };
}
