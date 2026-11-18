const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Vietnamese currency display shared by the board and the deal form (T224, FR-05). */
export function formatDealValue(value: number, currency: string): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      formatter = new Intl.NumberFormat('vi-VN');
    }
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}
