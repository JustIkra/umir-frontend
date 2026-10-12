import type { CookieNoticeStore } from '@/application/cookie-notice';

// Name and value are listed in the cookie policy table.
export const cookieNoticeKey = 'umir.cookieNotice';
const closedValue = 'closed';

export type StorageArea = Pick<Storage, 'getItem' | 'setItem'>;

// Storage may be missing or throw (blocked cookies, private mode). The notice then
// stays closed for the current page lifetime only.
export function createCookieNoticeStore(
  storage: StorageArea | undefined,
): CookieNoticeStore {
  let closedInMemory = false;
  return {
    isClosed() {
      if (closedInMemory) return true;
      try {
        return storage?.getItem(cookieNoticeKey) === closedValue;
      } catch {
        return false;
      }
    },
    close() {
      closedInMemory = true;
      try {
        storage?.setItem(cookieNoticeKey, closedValue);
      } catch {
        // The in-memory flag still hides the notice until reload.
      }
    },
  };
}
