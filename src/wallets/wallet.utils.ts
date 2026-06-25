/**
 * Masks a Stellar wallet address to show only the first 4 and last 6 characters,
 * with the middle replaced by asterisks.
 *
 * Example: GABC1234DEF5678 becomes GABC********5678
 *
 * @param address The full wallet address to mask
 * @returns The masked wallet address
 */
export function maskAddress(address: string): string {
  if (!address || address.length < 10) {
    return address;
  }
  const start = address.slice(0, 4);
  const end = address.slice(-6);
  return `${start}********${end}`;
}
