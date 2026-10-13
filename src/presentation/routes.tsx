import { useLayoutEffect } from 'react';
import { Outlet, useLocation, type RouteObject } from 'react-router';
import { AppShell } from './app-shell/app-shell';
import { OverviewPage, SectionPage } from './app-shell/pages';
import { appSections } from './app-shell/sections';
import {
  PasswordResetCodePage,
  PasswordResetNewPage,
  PasswordResetRequestPage,
} from './auth/password-reset-pages';
import { SignInCodePage } from './auth/sign-in-code-page';
import { SignInPage } from './auth/sign-in-page';
import { NotFoundPage } from './documents/not-found-page';
import {
  CookiePolicyPage,
  PersonalDataConsentPage,
  PrivacyPolicyPage,
} from './documents/pages';
import { LandingPage } from './landing/landing-page';

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
        children: [
          { index: true, element: <OverviewPage /> },
          ...appSections
            .filter((section) => section.path !== '/app')
            .map((section) => ({
              path: section.path.replace('/app/', ''),
              element: <SectionPage title={section.title} />,
            })),
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
