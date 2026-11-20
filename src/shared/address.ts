export function maskAddress(address: string): string;
export function maskAddress(address: null): null;
export function maskAddress(address: undefined): undefined;
export function maskAddress(
  address: string | null | undefined,
): string | null | undefined;
export function maskAddress(
  address: string | null | undefined,
): string | null | undefined {
  if (!address || address.length < 10) {
    return address;
  }

  const start = address.slice(0, 4);
  const end = address.slice(-6);
  return `${start}...${end}`;
}
