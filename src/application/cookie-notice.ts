// Remembers that the visitor closed the notice about strictly necessary cookies.
export interface CookieNoticeStore {
  isClosed(): boolean;
  close(): void;
}
