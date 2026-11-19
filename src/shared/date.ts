export function startOfUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
    ),
  );
}

export function previousUtcDay(instant: Date): Date {
  const start = startOfUtcDay(instant);
  return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}
