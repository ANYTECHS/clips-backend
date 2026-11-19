export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'USD',
  locale = 'en-US',
  options: Intl.NumberFormatOptions = {},
): string {
  const numericValue =
    typeof value === 'string' ? Number(value) : value ?? 0;

  if (!Number.isFinite(numericValue)) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options,
    }).format(0);
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options,
  }).format(numericValue);
}
