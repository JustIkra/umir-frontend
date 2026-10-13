import { useLayoutEffect } from 'react';
import { Outlet, useLocation, type RouteObject } from 'react-router';
import { AccountSettingsPage } from './app-shell/account-settings-page';
import { AppShell } from './app-shell/app-shell';
import { NoRestaurantsPage } from './app-shell/no-restaurants-page';
import { OverviewPage, SectionPage } from './app-shell/pages';
import { appSections } from './app-shell/sections';
import {
  PasswordResetCodePage,
  PasswordResetNewPage,
  PasswordResetRequestPage,
} from './auth/password-reset-pages';
import { SignInCodePage } from './auth/sign-in-code-page';
import { SignInPage } from './auth/sign-in-page';
import { NotFoundBoundary, NotFoundPage } from './documents/not-found-page';
import {
  CookiePolicyPage,
  PersonalDataConsentPage,
  PrivacyPolicyPage,
} from './documents/pages';
import { LandingPage } from './landing/landing-page';
import {
  adminOrganizationLoader,
  memberLoader,
  organizationLoader,
} from './organizations/loaders';
import { InvitationsPage } from './organizations/invitations-page';
import { InvitePage } from './organizations/invite-page';
import { MemberPage } from './organizations/member-page';
import { NewOrganizationPage } from './organizations/new-organization-page';
import { OrganizationProfilePage } from './organizations/organization-profile-page';
import { MembersPage } from './organizations/members-page';
import { OrganizationPage } from './organizations/organization-page';
import { OrganizationsPage } from './organizations/organizations-page';

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

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/privacy', element: <PrivacyPolicyPage /> },
      { path: '/cookies', element: <CookiePolicyPage /> },
      { path: '/consent', element: <PersonalDataConsentPage /> },
      { path: '/login', element: <SignInPage /> },
      { path: '/login/code', element: <SignInCodePage /> },
      { path: '/password-reset', element: <PasswordResetRequestPage /> },
      { path: '/password-reset/code', element: <PasswordResetCodePage /> },
      { path: '/password-reset/new', element: <PasswordResetNewPage /> },
      {
        path: '/app',
        element: <AppShell />,
        errorElement: <NotFoundBoundary />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'settings', element: <AccountSettingsPage /> },
          { path: 'organizations', element: <OrganizationsPage /> },
          { path: 'organizations/new', element: <NewOrganizationPage /> },
          {
            path: 'organizations/:org',
            loader: organizationLoader,
            element: <OrganizationPage />,
          },
          {
            path: 'organizations/:org/members',
            loader: adminOrganizationLoader,
            element: <MembersPage />,
          },
          {
            path: 'organizations/:org/members/:member',
            loader: memberLoader,
            element: <MemberPage />,
          },
          {
            path: 'organizations/:org/invitations',
            loader: adminOrganizationLoader,
            element: <InvitationsPage />,
          },
          {
            path: 'organizations/:org/invitations/new',
            loader: adminOrganizationLoader,
            element: <InvitePage />,
          },
          {
            path: 'organizations/:org/profile',
            loader: adminOrganizationLoader,
            element: <OrganizationProfilePage />,
          },
          ...appSections
            .filter((section) => section.path !== '/app')
            .map((section) => ({
              path: section.path.replace('/app/', ''),
              element: <SectionPage title={section.title} />,
            })),
        ],
      },
      {
        path: '/app/no-restaurants',
        element: <AppShell restaurant={false} />,
        children: [{ index: true, element: <NoRestaurantsPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
