/**
 * Masks a wallet address so only the first 4 and the last 6 characters remain
 * visible, with the middle replaced by asterisks (Issue #763).
 *
 * Example: "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
 *       -> "GC6X********UHTZF3"
 *
 * Addresses shorter than 10 characters are returned untouched — there is not
 * enough material to mask without the result leaking as much as the original.
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
