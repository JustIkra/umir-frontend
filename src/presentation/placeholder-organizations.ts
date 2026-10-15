// Temporary data from the Figma sample (slices 2a and 2b-1: OG01–OG03, MB01,
// MM01, IN01, IV01, TZ02). Organization screens show it until the auth API
// (umir-auth) provides organizations, members and invitations.

export type Role = 'Склад' | 'Официант';

export interface Zone {
  readonly city: string;
  readonly id: string;
  readonly offset: string;
}

export interface Restaurant {
  readonly name: string;
  // The signed-in account's roles here: «Администратор» or staff roles.
  readonly roles: readonly string[];
  readonly preparing?: boolean;
}

export interface Member {
  readonly id: string;
  readonly name: string;
  // RV01 title: «Отозвать доступ Ирины Ковалёвой?»
  readonly genitive: string;
  readonly email: string;
  // MB01 lines, one per role.
  readonly assignments: readonly string[];
  readonly admin?: boolean;
  readonly roles: Partial<Readonly<Record<string, readonly Role[]>>>;
}

export type InvitationStatus =
  | 'queued'
  | 'delivering'
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'cancelled'
  | 'failed';

export interface Invitation {
  readonly email: string;
  readonly assignments: string;
  readonly dates: string;
  readonly status: InvitationStatus;
}

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly admin: boolean;
  // OG01 card line: «Администратор», «Сотрудник: Склад, Официант».
  readonly role: string;
  readonly count: string;
  readonly zone: Zone;
  readonly restaurants: readonly Restaurant[];
  readonly members: readonly Member[];
  readonly invitations: readonly Invitation[];
}

const moscow: Zone = { city: 'Москва', id: 'Europe/Moscow', offset: 'UTC+3' };
const yekaterinburg: Zone = {
  city: 'Екатеринбург',
  id: 'Asia/Yekaterinburg',
  offset: 'UTC+5',
};
const berlin: Zone = { city: 'Берлин', id: 'Europe/Berlin', offset: 'UTC+2' };

// TZ02: Russian cities from Moscow eastwards, then foreign zones; offsets are
// for the sample date 13.10.2026.
export const zones: readonly Zone[] = [
  moscow,
  { city: 'Калининград', id: 'Europe/Kaliningrad', offset: 'UTC+2' },
  { city: 'Самара', id: 'Europe/Samara', offset: 'UTC+4' },
  yekaterinburg,
  { city: 'Омск', id: 'Asia/Omsk', offset: 'UTC+6' },
  { city: 'Новосибирск', id: 'Asia/Novosibirsk', offset: 'UTC+7' },
  { city: 'Красноярск', id: 'Asia/Krasnoyarsk', offset: 'UTC+7' },
  { city: 'Иркутск', id: 'Asia/Irkutsk', offset: 'UTC+8' },
  { city: 'Якутск', id: 'Asia/Yakutsk', offset: 'UTC+9' },
  { city: 'Владивосток', id: 'Asia/Vladivostok', offset: 'UTC+10' },
  { city: 'Магадан', id: 'Asia/Magadan', offset: 'UTC+11' },
  { city: 'Камчатка', id: 'Asia/Kamchatka', offset: 'UTC+12' },
  berlin,
  { city: 'Минск', id: 'Europe/Minsk', offset: 'UTC+3' },
  { city: 'Ташкент', id: 'Asia/Tashkent', offset: 'UTC+5' },
];

const turgenev = 'Ресторан „Тургеневский дворик“ на улице Тургеневской, 10/6';

// The bodies of the members, invitations and profile pages show this
// organization until their own tasks read the API.
export const administeredSample: Organization = {
  id: 'yug',
  name: 'Сеть ресторанов Южного федерального округа',
  admin: true,
  role: 'Администратор',
  count: '4 ресторана',
  zone: moscow,
  restaurants: [
    { name: turgenev, roles: ['Администратор'] },
    { name: 'На Береговой', roles: ['Администратор'] },
    { name: 'На Садовой', roles: ['Администратор'] },
    { name: 'На Чехова', roles: ['Администратор'], preparing: true },
  ],
  members: [
    {
      id: 'a1111111-1111-4111-8111-111111111111',
      name: 'Марина Белова',
      genitive: 'Марины Беловой',
      email: 'm.belova@restoran.example',
      assignments: ['Администратор организации · все рестораны'],
      admin: true,
      roles: {},
    },
    {
      id: 'a2222222-2222-4222-8222-222222222222',
      name: 'Ирина Ковалёва',
      genitive: 'Ирины Ковалёвой',
      email: 'i.kovaleva@restoran.example',
      assignments: [
        'Склад: На Береговой',
        `Официант: ${turgenev}; На Береговой`,
      ],
      roles: {
        [turgenev]: ['Официант'],
        'На Береговой': ['Склад', 'Официант'],
      },
    },
    {
      id: 'a3333333-3333-4333-8333-333333333333',
      name: 'Алексей Смирнов',
      genitive: 'Алексея Смирнова',
      email: 'a.smirnov@restoran.example',
      assignments: ['Склад: На Садовой'],
      roles: { 'На Садовой': ['Склад'] },
    },
    {
      id: 'a4444444-4444-4444-8444-444444444444',
      name: 'Дмитрий Орлов',
      genitive: 'Дмитрия Орлова',
      email: 'd.orlov@restoran.example',
      assignments: ['Официант: На Береговой; На Садовой'],
      roles: { 'На Береговой': ['Официант'], 'На Садовой': ['Официант'] },
    },
    {
      id: 'a5555555-5555-4555-8555-555555555555',
      name: 'Констанция Воскресенская-Добровольская',
      genitive: 'Констанции Воскресенской-Добровольской',
      email: 'k.voskresenskaya-dobrovolskaya@restoran.example',
      assignments: [`Склад и Официант: ${turgenev}; На Береговой; На Садовой`],
      roles: {
        [turgenev]: ['Склад', 'Официант'],
        'На Береговой': ['Склад', 'Официант'],
        'На Садовой': ['Склад', 'Официант'],
      },
    },
  ],
  invitations: [
    {
      email: 'n.volkova@restoran.example',
      assignments: 'Официант: На Садовой',
      dates: 'Создано 13.10.2026 14:30 · действует до 20.10.2026 14:30',
      status: 'queued',
    },
    {
      email: 'p.egorov@restoran.example',
      assignments: 'Склад: На Береговой',
      dates: 'Создано 13.10.2026 11:05 · действует до 20.10.2026 11:05',
      status: 'delivering',
    },
    {
      email: 'o.lebedeva@restoran.example',
      assignments: 'Склад и Официант: На Садовой',
      dates: 'Создано 10.10.2026 09:12 · действует до 17.10.2026 09:12',
      status: 'pending',
    },
    {
      email: 'd.orlov@restoran.example',
      assignments: 'Официант: На Береговой; На Садовой',
      dates: 'Принято 03.10.2026 16:40',
      status: 'accepted',
    },
    {
      email: 's.fedorov@restoran.example',
      assignments: `Официант: ${turgenev}`,
      dates: 'Истекло 05.10.2026 10:00',
      status: 'expired',
    },
    {
      email: 'k.sokolova@restoran.example',
      assignments: 'Склад: На Береговой',
      dates: 'Отменено 07.10.2026 12:20',
      status: 'cancelled',
    },
    {
      email: 't.morozov@restoran.example',
      assignments: 'Официант: На Садовой',
      dates: 'Письмо не отправлено. Проверьте адрес и пригласите повторно.',
      status: 'failed',
    },
  ],
};

export const organizations: readonly Organization[] = [
  administeredSample,
  {
    id: 'vostok-food',
    name: 'Восток Фуд',
    admin: false,
    role: 'Сотрудник: Склад, Официант',
    count: '2 ресторана',
    zone: moscow,
    restaurants: [
      { name: 'На Пушкинской', roles: ['Склад', 'Официант'] },
      { name: 'На Тургеневской', roles: ['Официант'] },
    ],
    members: [],
    invitations: [],
  },
  {
    id: 'ural-kitchen',
    name: 'Уральская кухня',
    admin: false,
    role: 'Сотрудник: Склад',
    count: '1 ресторан',
    zone: yekaterinburg,
    restaurants: [{ name: 'На Плотинке', roles: ['Склад'] }],
    members: [],
    invitations: [],
  },
  {
    id: 'vostok-food-europe',
    name: 'Восток Фуд Европа',
    admin: false,
    role: 'Сотрудник: Склад',
    count: '1 ресторан',
    zone: berlin,
    restaurants: [{ name: 'Берлин-Митте', roles: ['Склад'] }],
    members: [],
    invitations: [],
  },
];

// IV01: the invitation term for the sample date.
export const inviteValidity =
  'Приглашение действует 7 дней: до 20.10.2026 14:30 (Москва, UTC+3).';

export const findOrganization = (id: string | undefined) =>
  organizations.find((organization) => organization.id === id);
