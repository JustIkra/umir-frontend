export function remainingTime(expiresAt: number, evaluatedAt: number): string {
  const minutes = Math.ceil((expiresAt - evaluatedAt) / 60_000);
  if (minutes <= 0) return 'Срок истёк';
  if (minutes >= 1440) return `через ${String(Math.floor(minutes / 1440))} дн.`;
  if (minutes >= 60)
    return `через ${String(Math.floor(minutes / 60))} ч ${String(minutes % 60)} мин`;
  return `через ${String(minutes)} мин`;
}
