import { Injectable } from '@nestjs/common';

export interface MetadataValidationError {
  field: string;
  message: string;
}

export interface MetadataValidationResult {
  valid: boolean;
  errors: MetadataValidationError[];
}

/** URI schemes accepted for image, animation_url, and external_url fields. */
const VALID_URI_SCHEMES = ['https://', 'http://', 'ipfs://', 'ar://'];

/**
 * NftMetadataValidationService
 *
 * Validates NFT metadata JSON before upload / minting.
 * Rejects malformed or incomplete metadata that would result in broken
 * NFTs or poor marketplace compatibility.
 *
 * Validation checks:
 * - Required string fields: name, description
 * - Image URI format (image field)
 * - Animation URI format (animation_url field)
 * - Optional external_url format when present
 * - Attributes array structure (trait_type & value per entry)
 * - Royalty fields (seller_fee_basis_points, royalty.bps, royalty.percent)
 *
 * All errors are collected before returning so callers receive a complete
 * list rather than just the first failure.
 *
 * Closes #848.
 */
@Injectable()
export class NftMetadataValidationService {
  /**
   * Validate a complete NftMetadata object.
   * Returns a result with ALL errors found (not just the first).
   */
  validate(metadata: unknown): MetadataValidationResult {
    const errors: MetadataValidationError[] = [];

    if (!metadata || typeof metadata !== 'object') {
      return {
        valid: false,
        errors: [{ field: 'metadata', message: 'Metadata must be a non-null object' }],
      };
    }

    const m = metadata as Record<string, unknown>;

    // Required string fields
    this.validateRequiredString(m, 'name', errors);
    this.validateRequiredString(m, 'description', errors);

    // Image URI — required
    const imageError = this.validateUri(m, 'image');
    if (imageError) errors.push(imageError);

    // Animation URL (video clip) — required
    const animError = this.validateUri(m, 'animation_url');
    if (animError) errors.push(animError);

    // Optional external_url — validate only when present and non-null
    if (m['external_url'] !== undefined && m['external_url'] !== null) {
      const extError = this.validateUri(m, 'external_url');
      if (extError) errors.push(extError);
    }

    // Attributes array
    this.validateAttributes(m, errors);

    // Royalty fields
    this.validateRoyaltyFields(m, errors);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a metadata URI string already stored on the clip (e.g. ipfs://...).
   * Used independently from the full metadata object validation.
   */
  validateMetadataUri(uri: string | null | undefined): MetadataValidationResult {
    const errors: MetadataValidationError[] = [];

    if (!uri || typeof uri !== 'string' || !uri.trim()) {
      errors.push({ field: 'metadataUri', message: 'Metadata URI is required' });
      return { valid: false, errors };
    }

    const trimmed = uri.trim();
    if (!VALID_URI_SCHEMES.some((s) => trimmed.startsWith(s))) {
      errors.push({
        field: 'metadataUri',
        message: `Metadata URI must start with one of: ${VALID_URI_SCHEMES.join(', ')}`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private validateRequiredString(
    m: Record<string, unknown>,
    field: string,
    errors: MetadataValidationError[],
  ): void {
    if (typeof m[field] !== 'string' || !(m[field] as string).trim()) {
      errors.push({ field, message: `Required field '${field}' is missing or empty` });
    }
  }

  private validateUri(
    m: Record<string, unknown>,
    field: string,
  ): MetadataValidationError | null {
    const value = m[field];
    if (typeof value !== 'string' || !value.trim()) {
      return { field, message: `Required field '${field}' is missing or empty` };
    }
    const trimmed = value.trim();
    if (!VALID_URI_SCHEMES.some((s) => trimmed.startsWith(s))) {
      return {
        field,
        message: `'${field}' must be a valid URI starting with: ${VALID_URI_SCHEMES.join(', ')}`,
      };
    }
    return null;
  }

  private validateAttributes(
    m: Record<string, unknown>,
    errors: MetadataValidationError[],
  ): void {
    if (!Array.isArray(m['attributes'])) {
      errors.push({ field: 'attributes', message: 'attributes must be an array' });
      return;
    }

    (m['attributes'] as unknown[]).forEach((attr, i) => {
      if (!attr || typeof attr !== 'object') {
        errors.push({
          field: `attributes[${i}]`,
          message: 'Each attribute must be an object',
        });
        return;
      }
      const a = attr as Record<string, unknown>;
      if (typeof a['trait_type'] !== 'string' || !(a['trait_type'] as string).trim()) {
        errors.push({
          field: `attributes[${i}].trait_type`,
          message: `Attribute at index ${i} has an empty or missing trait_type`,
        });
      }
      if (a['value'] === null || a['value'] === undefined) {
        errors.push({
          field: `attributes[${i}].value`,
          message: `Attribute '${(a['trait_type'] as string | undefined) ?? i}' has a null or undefined value`,
        });
      }
    });
  }

  private validateRoyaltyFields(
    m: Record<string, unknown>,
    errors: MetadataValidationError[],
  ): void {
    // seller_fee_basis_points
    if (
      typeof m['seller_fee_basis_points'] !== 'number' ||
      !Number.isFinite(m['seller_fee_basis_points'] as number) ||
      (m['seller_fee_basis_points'] as number) < 0
    ) {
      errors.push({
        field: 'seller_fee_basis_points',
        message: 'seller_fee_basis_points must be a non-negative finite number',
      });
    }

    // royalty object
    if (!m['royalty'] || typeof m['royalty'] !== 'object') {
      errors.push({ field: 'royalty', message: 'royalty object is required' });
      return;
    }
    const royalty = m['royalty'] as Record<string, unknown>;

    if (
      typeof royalty['bps'] !== 'number' ||
      !Number.isFinite(royalty['bps'] as number)
    ) {
      errors.push({
        field: 'royalty.bps',
        message: 'royalty.bps must be a finite number',
      });
    }
    if (
      typeof royalty['percent'] !== 'number' ||
      !Number.isFinite(royalty['percent'] as number)
    ) {
      errors.push({
        field: 'royalty.percent',
        message: 'royalty.percent must be a finite number',
      });
    }
  }
}
