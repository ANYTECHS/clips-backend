import { NftMetadataValidationService } from './nft-metadata-validation.service';

describe('NftMetadataValidationService', () => {
  let service: NftMetadataValidationService;

  beforeEach(() => {
    service = new NftMetadataValidationService();
  });

  const validMetadata = {
    name: 'My Clip',
    description: 'A great viral moment',
    image: 'ipfs://bafybeig123',
    animation_url: 'https://cdn.example.com/clip.mp4',
    attributes: [
      { trait_type: 'Clip Duration', value: 30 },
      { trait_type: 'Platform', value: 'ClipCash' },
    ],
    seller_fee_basis_points: 1000,
    royalty: { bps: 1000, percent: 10 },
  };

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns valid=true with no errors for a correct metadata object', () => {
    const result = service.validate(validMetadata);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts http:// URIs for image and animation_url', () => {
    const m = {
      ...validMetadata,
      image: 'http://example.com/thumb.jpg',
      animation_url: 'http://example.com/clip.mp4',
    };
    expect(service.validate(m).valid).toBe(true);
  });

  it('accepts ar:// URIs', () => {
    const m = {
      ...validMetadata,
      image: 'ar://arweave-hash-abc',
      animation_url: 'ar://arweave-hash-xyz',
    };
    expect(service.validate(m).valid).toBe(true);
  });

  it('accepts optional external_url when it is a valid URI', () => {
    const m = { ...validMetadata, external_url: 'https://clipcash.io/clip/42' };
    expect(service.validate(m).valid).toBe(true);
  });

  it('accepts empty attributes array', () => {
    const m = { ...validMetadata, attributes: [] };
    expect(service.validate(m).valid).toBe(true);
  });

  it('accepts seller_fee_basis_points of 0', () => {
    const m = { ...validMetadata, seller_fee_basis_points: 0, royalty: { bps: 0, percent: 0 } };
    expect(service.validate(m).valid).toBe(true);
  });

  // ── Null / non-object input ───────────────────────────────────────────────

  it('returns invalid for null input', () => {
    const result = service.validate(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('metadata');
  });

  it('returns invalid for a string input', () => {
    const result = service.validate('not-an-object');
    expect(result.valid).toBe(false);
  });

  // ── Required string fields ────────────────────────────────────────────────

  it('errors when name is an empty string', () => {
    const result = service.validate({ ...validMetadata, name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('errors when name is whitespace only', () => {
    const result = service.validate({ ...validMetadata, name: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('errors when description is missing', () => {
    const { description: _, ...m } = validMetadata;
    const result = service.validate(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'description')).toBe(true);
  });

  // ── Image URI ────────────────────────────────────────────────────────────

  it('errors when image is not a valid URI scheme', () => {
    const result = service.validate({ ...validMetadata, image: 'ftp://invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'image')).toBe(true);
  });

  it('errors when image is empty', () => {
    const result = service.validate({ ...validMetadata, image: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'image')).toBe(true);
  });

  // ── Animation URI ─────────────────────────────────────────────────────────

  it('errors when animation_url is not a valid URI', () => {
    const result = service.validate({ ...validMetadata, animation_url: 'bad-url' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'animation_url')).toBe(true);
  });

  // ── Optional external_url ─────────────────────────────────────────────────

  it('errors when external_url is present but has an invalid scheme', () => {
    const result = service.validate({ ...validMetadata, external_url: 'ftp://bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'external_url')).toBe(true);
  });

  it('does not error when external_url is null (treated as absent)', () => {
    const result = service.validate({ ...validMetadata, external_url: null });
    expect(result.valid).toBe(true);
  });

  // ── Attributes ────────────────────────────────────────────────────────────

  it('errors when attributes is not an array', () => {
    const result = service.validate({ ...validMetadata, attributes: 'bad' } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'attributes')).toBe(true);
  });

  it('errors when an attribute has an empty trait_type', () => {
    const m = { ...validMetadata, attributes: [{ trait_type: '', value: 1 }] };
    const result = service.validate(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('trait_type'))).toBe(true);
  });

  it('errors when an attribute value is null', () => {
    const m = {
      ...validMetadata,
      attributes: [{ trait_type: 'Duration', value: null }],
    };
    const result = service.validate(m as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('value'))).toBe(true);
  });

  it('errors when an attribute value is undefined', () => {
    const m = { ...validMetadata, attributes: [{ trait_type: 'Score' }] };
    const result = service.validate(m as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('value'))).toBe(true);
  });

  it('does not error when an attribute is a non-object element', () => {
    const m = { ...validMetadata, attributes: [null] };
    const result = service.validate(m as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('attributes[0]'))).toBe(true);
  });

  // ── Royalty fields ────────────────────────────────────────────────────────

  it('errors when seller_fee_basis_points is negative', () => {
    const result = service.validate({ ...validMetadata, seller_fee_basis_points: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'seller_fee_basis_points')).toBe(true);
  });

  it('errors when seller_fee_basis_points is not a number', () => {
    const result = service.validate({ ...validMetadata, seller_fee_basis_points: 'ten' } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'seller_fee_basis_points')).toBe(true);
  });

  it('errors when royalty object is missing', () => {
    const { royalty: _, ...m } = validMetadata;
    const result = service.validate(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'royalty')).toBe(true);
  });

  it('errors when royalty.bps is not a number', () => {
    const m = { ...validMetadata, royalty: { bps: 'bad', percent: 10 } };
    const result = service.validate(m as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'royalty.bps')).toBe(true);
  });

  it('errors when royalty.percent is missing', () => {
    const m = { ...validMetadata, royalty: { bps: 1000 } };
    const result = service.validate(m as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'royalty.percent')).toBe(true);
  });

  // ── Multiple errors ───────────────────────────────────────────────────────

  it('collects multiple errors in a single pass', () => {
    const bad = {
      name: '',
      description: '',
      image: 'ftp://bad',
      animation_url: '',
      attributes: [{ trait_type: '', value: null }],
      seller_fee_basis_points: -1,
      royalty: null,
    };
    const result = service.validate(bad as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });

  // ── validateMetadataUri ───────────────────────────────────────────────────

  describe('validateMetadataUri', () => {
    it('passes for a valid ipfs:// URI', () => {
      expect(service.validateMetadataUri('ipfs://bafybeig').valid).toBe(true);
    });

    it('passes for a valid https:// URI', () => {
      expect(service.validateMetadataUri('https://example.com/meta.json').valid).toBe(true);
    });

    it('passes for an ar:// URI', () => {
      expect(service.validateMetadataUri('ar://arweave-hash').valid).toBe(true);
    });

    it('fails for null', () => {
      const r = service.validateMetadataUri(null);
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe('metadataUri');
    });

    it('fails for undefined', () => {
      expect(service.validateMetadataUri(undefined).valid).toBe(false);
    });

    it('fails for an empty string', () => {
      expect(service.validateMetadataUri('').valid).toBe(false);
    });

    it('fails for an unsupported scheme', () => {
      const r = service.validateMetadataUri('ftp://example.com/meta.json');
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe('metadataUri');
    });
  });
});
