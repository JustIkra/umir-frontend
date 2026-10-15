import { plural } from '@/presentation/ui/plural';

export function remainingTime(expiresAt: number, evaluatedAt: number): string {
  const minutes = Math.ceil((expiresAt - evaluatedAt) / 60_000);
  if (minutes <= 0) return 'Срок истёк';
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    return `через ${String(days)} ${plural(days, 'день', 'дня', 'дней')}`;
  }
  if (minutes >= 60)
    return `через ${String(Math.floor(minutes / 60))}\u00a0ч ${String(minutes % 60)}\u00a0мин`;
  return `через ${String(minutes)}\u00a0мин`;
}
