import type { PageVisibility } from '@/application/live-sync';

export type VisibilityDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

export function createPageVisibility(page: VisibilityDocument): PageVisibility {
  return {
    isVisible: () => page.visibilityState === 'visible',
    subscribe(onChange) {
      const listener = () => {
        onChange();
      };
      page.addEventListener('visibilitychange', listener);
      return () => {
        page.removeEventListener('visibilitychange', listener);
      };
    },
  };
}
