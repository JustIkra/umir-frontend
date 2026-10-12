import { useLayoutEffect } from 'react';
import { Outlet, useLocation, type RouteObject } from 'react-router';
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
