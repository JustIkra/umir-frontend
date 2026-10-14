import type { User, UserView } from '@/application/account';
import {
  boolean,
  entityId,
  instant,
  nonEmptyString,
  object,
  optionalString,
  string,
} from './common';

// #User: the profile inside UserView and the answer to a saved display name.
export function decodeUser(body: unknown, path = 'user'): User {
  const user = object(body, path);
  return {
    userID: entityId(user.userID, `${path}.userID`),
    login: string(user.login, `${path}.login`),
    displayName: string(user.displayName, `${path}.displayName`),
    email: optionalString(user.email, `${path}.email`),
  };
}

export function decodeUserView(body: unknown): UserView {
  const view = object(body, 'UserView');
  const session = object(view.session, 'UserView.session');
  return {
    user: decodeUser(view.user, 'UserView.user'),
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
