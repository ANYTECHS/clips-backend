/**
 * Soroban NFT contract custom error types (Issue #1056).
 *
 * Replaces generic error strings with a typed enum so that contract failures
 * are easier to diagnose and can be mapped consistently to HTTP responses.
 *
 * Error → HTTP mapping
 * ─────────────────────────────────────────────────────────────────────────────
 *  Unauthorized        → 403 Forbidden
 *  TokenNotFound       → 404 Not Found
 *  InvalidRoyalty      → 400 Bad Request
 *  ContractPaused      → 409 Conflict
 *  CooldownActive      → 429 Too Many Requests
 *  ClipAlreadyMinted   → 409 Conflict
 *  InsufficientBalance → 402 Payment Required
 *  TokenFrozen         → 409 Conflict
 *  InvalidSignature    → 400 Bad Request
 *  SignatureExpired    → 401 Unauthorized
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: The string values mirror the identifiers emitted by the on-chain Soroban
 * contract so they can be matched directly from simulated-transaction error
 * messages.
 */
export enum SorobanContractError {
  /** A clip that was already minted is being minted again. */
  ClipAlreadyMinted = 'ClipAlreadyMinted',

  /** Caller is not authorised to perform the requested operation. */
  Unauthorized = 'Unauthorized',

  /** Wallet balance is too low for the requested operation. */
  InsufficientBalance = 'InsufficientBalance',

  /** The requested token ID does not exist in the contract. */
  TokenNotFound = 'TokenNotFound',

  /** Royalty basis-points value is outside the allowed range (0–10 000). */
  InvalidRoyalty = 'InvalidRoyalty',

  /** The contract has been administratively paused and rejects mutations. */
  ContractPaused = 'ContractPaused',

  /** The requested token is frozen and cannot be transferred or modified. */
  TokenFrozen = 'TokenFrozen',

  /** The caller must wait before repeating this operation (rate-limit). */
  CooldownActive = 'CooldownActive',

  /** The supplied cryptographic signature is invalid. */
  InvalidSignature = 'InvalidSignature',

  /** The supplied cryptographic signature has expired. */
  SignatureExpired = 'SignatureExpired',
}

/**
 * Human-readable descriptions for each contract error, suitable for API
 * responses and logs.
 */
export const SOROBAN_CONTRACT_ERROR_MESSAGES: Record<SorobanContractError, string> = {
  [SorobanContractError.ClipAlreadyMinted]: 'This clip has already been minted as an NFT.',
  [SorobanContractError.Unauthorized]: 'Caller is not authorised to perform this operation.',
  [SorobanContractError.InsufficientBalance]: 'Insufficient wallet balance for this operation.',
  [SorobanContractError.TokenNotFound]: 'The requested token does not exist.',
  [SorobanContractError.InvalidRoyalty]: 'Royalty basis-points must be between 0 and 10 000.',
  [SorobanContractError.ContractPaused]: 'The NFT contract is currently paused.',
  [SorobanContractError.TokenFrozen]: 'This token is frozen and cannot be modified.',
  [SorobanContractError.CooldownActive]: 'Please wait before repeating this operation.',
  [SorobanContractError.InvalidSignature]: 'The provided signature is invalid.',
  [SorobanContractError.SignatureExpired]: 'The provided signature has expired.',
};

/**
 * Maps a {@link SorobanContractError} to the appropriate HTTP status code.
 *
 * @example
 * ```ts
 * const httpStatus = contractErrorToHttpStatus(SorobanContractError.Unauthorized);
 * // → 403
 * ```
 */
export function contractErrorToHttpStatus(error: SorobanContractError): number {
  const mapping: Record<SorobanContractError, number> = {
    [SorobanContractError.ClipAlreadyMinted]: 409,
    [SorobanContractError.Unauthorized]: 403,
    [SorobanContractError.InsufficientBalance]: 402,
    [SorobanContractError.TokenNotFound]: 404,
    [SorobanContractError.InvalidRoyalty]: 400,
    [SorobanContractError.ContractPaused]: 409,
    [SorobanContractError.TokenFrozen]: 409,
    [SorobanContractError.CooldownActive]: 429,
    [SorobanContractError.InvalidSignature]: 400,
    [SorobanContractError.SignatureExpired]: 401,
  };
  return mapping[error] ?? 500;
}

/**
 * Parses a raw Soroban error string / Error object and attempts to identify a
 * known {@link SorobanContractError} variant.
 *
 * Soroban contract error messages typically contain a diagnostic string such as
 * `"Contract error: Unauthorized"` or just the variant name. This helper scans
 * the message for any known variant name.
 *
 * @returns The matched {@link SorobanContractError}, or `null` if no match.
 *
 * @example
 * ```ts
 * const err = parseContractError('Error: Contract invocation failed: TokenNotFound');
 * // → SorobanContractError.TokenNotFound
 * ```
 */
export function parseContractError(raw: unknown): SorobanContractError | null {
  const message = raw instanceof Error ? raw.message : String(raw ?? '');
  for (const variant of Object.values(SorobanContractError)) {
    if (message.includes(variant)) {
      return variant as SorobanContractError;
    }
  }
  return null;
}
