import type { UserView } from '@/application/account';
import {
  boolean,
  entityId,
  instant,
  nonEmptyString,
  object,
  optionalString,
  string,
} from './common';

export function decodeUserView(body: unknown): UserView {
  const view = object(body, 'UserView');
  const user = object(view.user, 'UserView.user');
  const session = object(view.session, 'UserView.session');
  return {
    user: {
      userID: entityId(user.userID, 'user.userID'),
      login: string(user.login, 'user.login'),
      displayName: string(user.displayName, 'user.displayName'),
      email: optionalString(user.email, 'user.email'),
    },
    session: {
      expiresAt: instant(session.expiresAt, 'session.expiresAt'),
      idleExpiresAt: instant(session.idleExpiresAt, 'session.idleExpiresAt'),
      absoluteExpiresAt: instant(
        session.absoluteExpiresAt,
        'session.absoluteExpiresAt',
      ),
      rememberMe: boolean(session.rememberMe, 'session.rememberMe'),
    },
    csrfToken: nonEmptyString(session.csrfToken, 'session.csrfToken'),
  };
}

export function decodeCsrfToken(body: unknown): string {
  return nonEmptyString(
    object(body, 'CsrfTokenView').csrfToken,
    'CsrfTokenView.csrfToken',
  );
}
