// Temporary data from the Figma sample (K01). The warehouse delivery page shows it
// until the delivery API is connected.

export type Unit = 'г' | 'мл' | 'шт';

export interface Product {
  readonly code: string;
  readonly name: string;
  readonly unit: Unit;
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

export const findProduct = (code: string) =>
  products.find((candidate) => candidate.code === code);
