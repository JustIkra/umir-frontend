// Temporary data from the Figma sample (K01, K12, K13). Catalog screens show it
// until the catalog API is connected.

export type Unit = 'г' | 'мл' | 'шт';

export const unitNames: Record<Unit, string> = {
  г: 'граммы, г',
  мл: 'миллилитры, мл',
  шт: 'штуки, шт',
};

export interface Product {
  readonly code: string;
  readonly name: string;
  readonly unit: Unit;
}

export interface RecipeLine {
  readonly product: string;
  readonly quantity: string;
}

export interface Dish {
  readonly code: string;
  readonly name: string;
  readonly recipe?: readonly RecipeLine[];
}

const product = (code: string, name: string, unit: Unit): Product => ({
  code,
  name,
  unit,
});

export const products: readonly Product[] = [
  product('101', 'Авокадо', 'шт'),
  product('102', 'Багет', 'шт'),
  product('103', 'Базилик', 'г'),
  product('104', 'Бекон', 'г'),
  product('105', 'Белые грибы', 'г'),
  product('106', 'Говядина', 'г'),
  product('107', 'Киноа', 'г'),
  product('108', 'Клюква', 'г'),
  product('109', 'Куриное филе', 'г'),
  product('110', 'Масло оливковое', 'мл'),
  product('111', 'Масло трюфельное', 'мл'),
  product('112', 'Мука пшеничная', 'г'),
  product('113', 'Паста спагетти', 'г'),
  product('114', 'Паста феттучине', 'г'),
  product('115', 'Перец сладкий', 'г'),
  product('116', 'Рис арборио', 'г'),
  product('117', 'Руккола', 'г'),
  product('118', 'Салат романо', 'г'),
  product('119', 'Сахар', 'г'),
  product('120', 'Свёкла', 'г'),
  product('121', 'Сливки 33%', 'мл'),
  product('122', 'Сливочный сыр', 'г'),
  product('123', 'Сметана', 'г'),
  product('124', 'Соль морская', 'г'),
  product('125', 'Сыр пармезан', 'г'),
  product('126', 'Творог', 'г'),
  product('127', 'Томаты черри', 'г'),
  product('128', 'Тыква', 'г'),
  product('129', 'Тыквенные семечки', 'г'),
  product('130', 'Филе лосося', 'г'),
  product('131', 'Шпинат', 'г'),
  product('132', 'Яйцо куриное', 'шт'),
];

export const dishes: readonly Dish[] = [
  { code: '201', name: 'Борщ с говядиной и сметаной' },
  { code: '202', name: 'Брускетта с томатами и базиликом' },
  {
    code: '203',
    name: 'Крем-суп из тыквы с обжаренными тыквенными семечками и сливочным сыром',
  },
  { code: '204', name: 'Морс клюквенный' },
  { code: '205', name: 'Паста карбонара' },
  {
    code: '206',
    name: 'Паста с лососем и шпинатом',
    recipe: [
      { product: '114', quantity: '100' },
      { product: '130', quantity: '120' },
      { product: '131', quantity: '40' },
      { product: '121', quantity: '50' },
      { product: '125', quantity: '15' },
      { product: '124', quantity: '0,5' },
    ],
  },
  { code: '207', name: 'Ризотто с пармезаном и рукколой' },
  { code: '208', name: 'Салат с лососем, киноа и печёным перцем' },
  { code: '209', name: 'Сырники со сметаной' },
  {
    code: '210',
    name: 'Тальятелле с белыми грибами в сливочном соусе с трюфельным маслом',
  },
  { code: '211', name: 'Тартар из лосося с авокадо' },
  { code: '212', name: 'Цезарь с курицей' },
];

export const catalogStamp = '10.10.2026, 15:22:10 UTC+3';

export const findProduct = (code: string) =>
  products.find((candidate) => candidate.code === code);

// Only dishes whose recipe is drawn in Figma have a page.
export const findRecipeDish = (code: string | undefined) =>
  dishes.find((dish) => dish.code === code && dish.recipe !== undefined);
