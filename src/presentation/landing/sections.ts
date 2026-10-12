// Section anchors shared by the site header, the hero action and the footer.
export const landingSections = [
  { id: 'features', title: 'Возможности' },
  { id: 'how-it-works', title: 'Как это работает' },
  { id: 'principles', title: 'Принципы' },
  { id: 'contacts', title: 'Контакты' },
] as const;

export type LandingSectionId = (typeof landingSections)[number]['id'];
