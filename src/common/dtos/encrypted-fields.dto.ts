/**
 * Documentation of encrypted fields that are NEVER returned in API responses.
 *
 * This module documents which fields are encrypted in the database and must
 * never appear in plaintext in any API response. Fields listed here are handled
 * by the EncryptionService and are subject to field-level encryption using
 * database column definitions with ENCRYPTED or similar markers.
 *
 * **Security Rule:** If any of these fields ever appear unencrypted in an API
 * response body, it is a security vulnerability that must be reported and fixed
 * immediately.
 */

/**
 * Fields that are encrypted in the database and must NEVER appear in API responses.
 *
 * These fields are encrypted server-side in the database and are decrypted only
 * when needed for business logic (e.g., to call a third-party API). They are
 * never returned to clients.
 */
export const ENCRYPTED_FIELDS_NEVER_IN_RESPONSE = [
  /**
   * User Platform Tokens - Social platform integration tokens that grant access
   * to user accounts on TikTok, YouTube, Instagram, etc.
   *
   * Location: UserPlatform.accessToken, UserPlatform.refreshToken
   * Risk: If exposed, attacker can impersonate user on the social platform
   * Usage: Internal service-to-service only, never sent to client
   */
  'accessToken (UserPlatform)',
  'refreshToken (UserPlatform)',

  /**
   * Platform Credentials - Passwords or secrets for accessing platform APIs
   *
   * Location: Various service configuration tables
   * Risk: Complete account compromise if exposed
   * Usage: Internal service-to-service only
   */
  'platformPassword',
  'apiSecret',
  'webhookSecret',

  /**
   * Sensitive Financial Data - Credit card tokens, bank account details (if stored)
   *
   * Location: PaymentMethod table (if PCI-DSS compliance requires storage)
   * Risk: Payment fraud, account takeover
   * Usage: Passed only to payment processors via encrypted channels
   */
  'stripeToken',
  'bankAccountNumber',
  'routingNumber',

  /**
   * Private Keys - Blockchain or encryption keys (if stored)
   *
   * Location: Wallet.privateKey (if custodial wallets are supported)
   * Risk: Complete blockchain account compromise
   * Usage: Kept in secure key management system, never sent over API
   */
  'privateKey',
] as const;

/**
 * DTOs and response types that explicitly handle encrypted fields.
 *
 * When a DTO or response type includes a field that might be encrypted,
 * these patterns ensure encryption handling:
 *
 * 1. **Omit Pattern**: Field is omitted entirely from the response
 *    - Good for secrets that are never needed client-side
 *    - Used for accessToken, refreshToken, privateKey
 *
 * 2. **Mask Pattern**: Field is partially revealed for verification
 *    - Good for addresses and identifiers where user needs to verify it's correct
 *    - Used for stellarPublicKey (masked as GABC...X92K)
 *
 * 3. **Hash Pattern**: Field is replaced with deterministic hash
 *    - Good for finding/searching without revealing the value
 *    - Used for email addresses (can search by hash without exposing plaintext)
 *
 * 4. **Encrypted Pattern**: Field is decrypted and returned (rare, high risk)
 *    - Only when necessary for business logic
 *    - Requires explicit security review
 *    - Example: Platform tokens decrypted only when calling the platform API
 */
export const ENCRYPTION_HANDLING_PATTERNS = {
  omit: 'Field completely omitted from response (most secure)',
  mask: 'Field partially masked/redacted (e.g., last 4 chars visible)',
  hash: 'Field replaced with deterministic hash (searchable but not reversible)',
  encrypted:
    'Field decrypted and returned (rare, high-risk, requires security review)',
} as const;

/**
 * Common patterns for DTO field definitions that handle encrypted data.
 *
 * Use these patterns in your DTO classes:
 *
 * ```typescript
 * // Pattern 1: Omit secret entirely
 * export class UserDto {
 *   // NO accessToken field at all
 *   // NO refreshToken field at all
 * }
 *
 * // Pattern 2: Mask sensitive identifier
 * import { ApiProperty } from '@nestjs/swagger';
 * export class WalletDto {
 *   @ApiProperty({
 *     description: 'Masked Stellar public key for verification',
 *     example: 'GABC...X92K'
 *   })
 *   stellarPublicKey: string; // Returned as GABC...X92K not full key
 * }
 *
 * // Pattern 3: Document why field is NOT in response
 * import { ApiPropertyOptional } from '@nestjs/swagger';
 * export class PlatformConnectionDto {
 *   // @ApiPropertyOptional({ deprecated: true })
 *   // NOT RETURNED: accessToken is encrypted and never sent to client.
 *   // If you need platform credentials, call the platform API directly.
 * }
 * ```
 */
export const DTO_PATTERNS_FOR_ENCRYPTION = {
  completeOmission: {
    description: 'Do not define the field in DTO at all',
    example: 'accessToken is not in UserPlatformResponseDto',
    risk: 'LOW',
  },
  explicitDocumentation: {
    description:
      'Document that field is encrypted and intentionally omitted',
    example:
      '/* NOT RETURNED: accessToken is encrypted and never exposed */ ',
    risk: 'LOW',
  },
  masking: {
    description: 'Return masked version in DTO, store full value encrypted',
    example:
      'stellarPublicKey in WalletDto is masked (GABC...X92K not GABC...full)',
    risk: 'LOW',
  },
  wrongApproach: {
    description: 'NEVER: Returning encrypted field without decrypting',
    example:
      'WRONG: { walletAddress: "U2FsdGVkX1...encrypted" } instead of masking',
    risk: 'CRITICAL - Looks like secret leaked',
  },
} as const;

/**
 * Auditing encrypted field exposure.
 *
 * To find all potential encrypted field leaks:
 *
 * 1. Search for fields in ENCRYPTED_FIELDS_NEVER_IN_RESPONSE above
 * 2. Grep the codebase for these field names in response DTOs
 * 3. Check controller return types
 * 4. Search test fixtures and mocks for these values
 *
 * Example commands:
 * ```bash
 * # Find DTOs that might expose accessToken
 * grep -r "accessToken" src/**/*.dto.ts
 *
 * # Find direct Prisma returns (should use select/omit)
 * grep -r "return.*prisma.*user" src/**/*.service.ts
 *
 * # Check swagger examples in comments
 * grep -r "\"accessToken\"" src/**/*.ts
 * ```
 */

/**
 * Prisma patterns to prevent encrypted field leaks.
 *
 * Always use `select` or `omit` to explicitly control which fields are returned:
 *
 * ```typescript
 * // GOOD: Explicitly select safe fields
 * const user = await prisma.user.findUnique({
 *   where: { id: userId },
 *   select: {
 *     id: true,
 *     email: true,
 *     name: true,
 *     // NO accessToken, NO refreshToken
 *   },
 * });
 *
 * // WRONG: Returns all fields including secrets
 * const user = await prisma.user.findUnique({ where: { id: userId } });
 *
 * // ALSO WRONG: include() can leak secrets if not careful
 * const user = await prisma.user.findUnique({
 *   where: { id: userId },
 *   include: { platforms: true }, // userPlatforms might have encrypted tokens!
 * });
 *
 * // BETTER: If you must include, explicitly omit secrets
 * const user = await prisma.user.findUnique({
 *   where: { id: userId },
 *   include: {
 *     platforms: {
 *       select: { id: true, platformName: true }
 *       // NO accessToken, NO refreshToken
 *     },
 *   },
 * });
 * ```
 */

/**
 * Testing encrypted field handling.
 *
 * Unit tests should verify encrypted fields are NOT in responses:
 *
 * ```typescript
 * describe('UserPlatformResponseDto', () => {
 *   it('never includes accessToken in response', () => {
 *     const dto = new UserPlatformResponseDto({
 *       id: 1,
 *       platformName: 'tiktok',
 *       username: 'myusername',
 *       // intentionally NO accessToken
 *     });
 *
 *     expect(dto).not.toHaveProperty('accessToken');
 *     expect(JSON.stringify(dto)).not.toContain('secret');
 *   });
 * });
 * ```
 */
