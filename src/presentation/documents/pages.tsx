import { cookiePolicy, personalDataConsent, privacyPolicy } from './content';
import { DocumentPage } from './document-page';

export function PrivacyPolicyPage() {
  return <DocumentPage document={privacyPolicy} />;
}

export function CookiePolicyPage() {
  return <DocumentPage document={cookiePolicy} />;
}

export function PersonalDataConsentPage() {
  return <DocumentPage document={personalDataConsent} />;
}
