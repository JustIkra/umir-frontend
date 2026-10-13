// Temporary data from the Figma sample (W03, W06, S01). Screens show it until
// the auth API (umir-auth) provides the signed-in account.
export const placeholderAccount = {
  displayName: 'Марина Белова',
  login: 'm.belova',
  email: 'm.belova@restoran.example',
  maskedEmail: 'm•••@restoran.example',
  organization: 'Восток Фуд',
  restaurant: 'На Пушкинской',
  roles: 'Склад, Официант',
  // Header date line of the sample day (W03, 01, S1, K01).
  today: 'Суббота, 10 октября 2026 · Москва, UTC+3',
} as const;
