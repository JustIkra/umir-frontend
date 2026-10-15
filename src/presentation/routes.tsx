import { useLayoutEffect } from 'react';
import { Outlet, useLocation, type RouteObject } from 'react-router';
import { AccountSettingsPage } from './app-shell/account-settings-page';
import { AppShell } from './app-shell/app-shell';
import { FeedbackPage } from './app-shell/feedback-page';
import {
  AppEntry,
  AppGate,
  RestaurantScope,
  SectionGate,
  createAppLoader,
  createEntryLoader,
  createRestaurantLoader,
  createSignInLoader,
} from './app-shell/gates';
import { NoRestaurantsPage } from './app-shell/no-restaurants-page';
import { SectionPage } from './app-shell/pages';
import {
  PasswordResetCodePage,
  PasswordResetNewPage,
  createResetStepLoader,
  PasswordResetRequestPage,
} from './auth/password-reset-pages';
import { LogoutPage } from './auth/logout-page';
import { SignInPage } from './auth/sign-in-page';
import { DishPage } from './catalog/dish-page';
import { DishesPage } from './catalog/dishes-page';
import { dishLoader } from './catalog/loaders';
import { NewDishPage } from './catalog/new-dish-page';
import { NewProductPage } from './catalog/new-product-page';
import { ProductsPage } from './catalog/products-page';
import { NotFoundBoundary, NotFoundPage } from './documents/not-found-page';
import {
  CookiePolicyPage,
  PersonalDataConsentPage,
  PrivacyPolicyPage,
} from './documents/pages';
import { InviteAcceptancePage, createInviteLoader } from './invite/invite-page';
import { LandingPage } from './landing/landing-page';
import {
  createAdminLoader,
  createMemberLoader,
  createOrganizationLoader,
} from './organizations/loaders';
import { OrdersPage } from './orders/orders-page';
import { InvitationsPage } from './organizations/invitations-page';
import { InvitePage } from './organizations/invite-page';
import { MemberPage } from './organizations/member-page';
import { NewOrganizationPage } from './organizations/new-organization-page';
import { OrganizationProfilePage } from './organizations/organization-profile-page';
import { MembersPage } from './organizations/members-page';
import { OrganizationPage } from './organizations/organization-page';
import { OrganizationsPage } from './organizations/organizations-page';
import { OverviewPage } from './overview/overview-page';
import { DeliveryPage } from './warehouse/delivery-page';
import { ExpiryPage } from './warehouse/expiry-page';
import { HistoryPage } from './warehouse/history-page';
import { StockPage } from './warehouse/stock-page';
import type { PresentationServices } from './services';

// Opens every page at its top or at the linked section. React Router's
// ScrollRestoration is not used: it keeps positions in sessionStorage, which
// the cookie policy does not list.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Root() {
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

// Restaurant sections under /app/r/:restaurantID; each section checks the
// restaurant's rights (W14).
const restaurantRoutes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },
  { path: 'feedback', element: <FeedbackPage /> },
  {
    path: 'orders',
    element: <SectionGate section="orders" />,
    children: [{ index: true, element: <OrdersPage /> }],
  },
  {
    path: 'warehouse',
    element: <SectionGate section="warehouse" />,
    children: [
      { index: true, element: <StockPage /> },
      { path: 'expiry', element: <ExpiryPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'delivery', element: <DeliveryPage /> },
    ],
  },
  {
    path: 'catalog',
    element: <SectionGate section="catalog" />,
    children: [
      { index: true, element: <ProductsPage /> },
      { path: 'dishes', element: <DishesPage /> },
      { path: 'dishes/new', element: <NewDishPage /> },
      { path: 'dishes/:dish', loader: dishLoader, element: <DishPage /> },
      { path: 'products/new', element: <NewProductPage /> },
    ],
  },
  {
    path: 'menu',
    element: <SectionGate section="menu" />,
    children: [
      { index: true, element: <SectionPage title="Меню и рекомендации" /> },
    ],
  },
  {
    path: 'analytics',
    element: <SectionGate section="analytics" />,
    children: [{ index: true, element: <SectionPage title="Аналитика" /> }],
  },
];

export function createRoutes(services: PresentationServices): RouteObject[] {
  return [
    {
      element: <Root />,
      children: [
        { path: '/', element: <LandingPage /> },
        { path: '/privacy', element: <PrivacyPolicyPage /> },
        { path: '/cookies', element: <CookiePolicyPage /> },
        { path: '/consent', element: <PersonalDataConsentPage /> },
        {
          path: '/login',
          loader: createSignInLoader(services),
          element: <SignInPage />,
        },
        { path: '/logout', element: <LogoutPage /> },
        { path: '/password-reset', element: <PasswordResetRequestPage /> },
        {
          path: '/password-reset/code',
          loader: createResetStepLoader(services, 'code'),
          element: <PasswordResetCodePage />,
        },
        {
          path: '/password-reset/new',
          loader: createResetStepLoader(services, 'password'),
          element: <PasswordResetNewPage />,
        },
        {
          path: '/invite/:invitationID',
          loader: createInviteLoader(services),
          element: <InviteAcceptancePage />,
          errorElement: <NotFoundBoundary />,
        },
        {
          path: '/app',
          loader: createAppLoader(services),
          element: <AppGate />,
          errorElement: <NotFoundBoundary />,
          children: [
            {
              index: true,
              loader: createEntryLoader(services),
              element: <AppEntry />,
            },
            {
              path: 'r/:restaurantID',
              loader: createRestaurantLoader(services),
              element: <RestaurantScope />,
              children: restaurantRoutes,
            },
            {
              element: <AppShell />,
              children: [
                { path: 'settings', element: <AccountSettingsPage /> },
                { path: 'organizations', element: <OrganizationsPage /> },
                { path: 'organizations/new', element: <NewOrganizationPage /> },
                {
                  path: 'organizations/:org',
                  loader: createOrganizationLoader(services),
                  element: <OrganizationPage />,
                },
                {
                  path: 'organizations/:org/members',
                  loader: createAdminLoader(services),
                  element: <MembersPage />,
                },
                {
                  path: 'organizations/:org/members/:member',
                  loader: createMemberLoader(services),
                  element: <MemberPage />,
                },
                {
                  path: 'organizations/:org/invitations',
                  loader: createAdminLoader(services),
                  element: <InvitationsPage />,
                },
                {
                  path: 'organizations/:org/invitations/new',
                  loader: createAdminLoader(services),
                  element: <InvitePage />,
                },
                {
                  path: 'organizations/:org/profile',
                  loader: createAdminLoader(services),
                  element: <OrganizationProfilePage />,
                },
              ],
            },
            {
              path: 'no-restaurants',
              element: <AppShell mode="none" />,
              children: [{ index: true, element: <NoRestaurantsPage /> }],
            },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
