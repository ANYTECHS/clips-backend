import { NftMetadataService } from './nft-metadata.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';

describe('NftMetadataService', () => {
  const mockRoyaltyConfig = {
    getRoyaltyAsset: jest.fn().mockReturnValue({ code: 'native' }),
  };

  let service: NftMetadataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftMetadataService(
      mockRoyaltyConfig as unknown as RoyaltyConfigurationService,
    );
  });

  const baseClip = {
    id: 42,
    title: 'My Cool Clip',
    caption: 'A fun moment',
    clipUrl: 'https://cdn.example.com/clip.mp4',
    thumbnail: 'https://cdn.example.com/thumb.jpg',
    duration: 30,
    viralityScore: 85,
    createdAt: new Date('2025-06-15T12:00:00Z'),
    royaltyBps: 1000,
  };

  it('builds standard OpenSea-compatible metadata', () => {
    const result = service.build(baseClip);

    expect(result.name).toBe('My Cool Clip');
    expect(result.description).toBe('A fun moment');
    expect(result.image).toBe('https://cdn.example.com/thumb.jpg');
    expect(result.animation_url).toBe('https://cdn.example.com/clip.mp4');
    expect(result.seller_fee_basis_points).toBe(1000);
    expect(result.royalty.bps).toBe(1000);
    expect(result.royalty.percent).toBe(10);
    expect(result.viralityScore).toBe(85);
    expect(result.originalDuration).toBe(30);
  });

  it('includes Platform trait in attributes', () => {
    const result = service.build(baseClip);

    const platformAttr = result.attributes.find(
      (a) => a.trait_type === 'Platform',
    );
    expect(platformAttr).toBeDefined();
    expect(platformAttr!.value).toBe('ClipCash');
  });

  it('falls back to default name and description when title/caption are null', () => {
    const clip = { ...baseClip, title: null, caption: null };
    const result = service.build(clip);

    expect(result.name).toBe('Clip #42');
    expect(result.description).toBe('ClipCash generated clip 42');
  });

  it('falls back to clipUrl when thumbnail is null', () => {
    const clip = { ...baseClip, thumbnail: null };
    const result = service.build(clip);

    expect(result.image).toBe('https://cdn.example.com/clip.mp4');
  });

  describe('rich attributes', () => {
    it('includes originalVideoDuration when provided', () => {
      const clip = { ...baseClip, originalVideoDuration: 120 };
      const result = service.build(clip);

      const attr = result.attributes.find(
        (a) => a.trait_type === 'Original Video Duration',
      );
      expect(attr).toBeDefined();
      expect(attr!.value).toBe(120);
    });

    it('omits originalVideoDuration when undefined', () => {
      const result = service.build(baseClip);

      const attr = result.attributes.find(
        (a) => a.trait_type === 'Original Video Duration',
      );
      expect(attr).toBeUndefined();
    });

    it('includes creator handle when provided', () => {
      const clip = { ...baseClip, creatorHandle: '@clipmaster' };
      const result = service.build(clip);

      const attr = result.attributes.find((a) => a.trait_type === 'Creator');
      expect(attr).toBeDefined();
      expect(attr!.value).toBe('@clipmaster');
    });

    it('includes tags and tag count when provided', () => {
      const clip = { ...baseClip, tags: ['funny', 'viral', 'dance'] };
      const result = service.build(clip);

      const tagsAttr = result.attributes.find((a) => a.trait_type === 'Tags');
      expect(tagsAttr).toBeDefined();
      expect(tagsAttr!.value).toBe('funny, viral, dance');

      const countAttr = result.attributes.find(
        (a) => a.trait_type === 'Tag Count',
      );
      expect(countAttr).toBeDefined();
      expect(countAttr!.value).toBe(3);
    });

    it('omits tags when empty array', () => {
      const clip = { ...baseClip, tags: [] };
      const result = service.build(clip);

      const tagsAttr = result.attributes.find((a) => a.trait_type === 'Tags');
      expect(tagsAttr).toBeUndefined();
    });

    it('includes posted platforms and platform count when provided', () => {
      const clip = {
        ...baseClip,
        platforms: ['tiktok', 'instagram', 'youtube'],
      };
      const result = service.build(clip);

      const platformsAttr = result.attributes.find(
        (a) => a.trait_type === 'Posted Platforms',
      );
      expect(platformsAttr).toBeDefined();
      expect(platformsAttr!.value).toBe('tiktok, instagram, youtube');

      const countAttr = result.attributes.find(
        (a) => a.trait_type === 'Platform Count',
      );
      expect(countAttr).toBeDefined();
      expect(countAttr!.value).toBe(3);
    });

    it('omits platforms when empty array', () => {
      const clip = { ...baseClip, platforms: [] };
      const result = service.build(clip);

      const attr = result.attributes.find(
        (a) => a.trait_type === 'Posted Platforms',
      );
      expect(attr).toBeUndefined();
    });

    it('includes all base attributes plus rich attributes', () => {
      const clip = {
        ...baseClip,
        originalVideoDuration: 60,
        creatorHandle: '@test',
        tags: ['a'],
        platforms: ['tiktok'],
      };
      const result = service.build(clip);

      const traitTypes = result.attributes.map((a) => a.trait_type);
      expect(traitTypes).toContain('Clip Duration');
      expect(traitTypes).toContain('Virality Score');
      expect(traitTypes).toContain('Creation Date');
      expect(traitTypes).toContain('Royalty BPS');
      expect(traitTypes).toContain('Royalty Percent');
      expect(traitTypes).toContain('Platform');
      expect(traitTypes).toContain('Original Video Duration');
      expect(traitTypes).toContain('Creator');
      expect(traitTypes).toContain('Tags');
      expect(traitTypes).toContain('Tag Count');
      expect(traitTypes).toContain('Posted Platforms');
      expect(traitTypes).toContain('Platform Count');
    });
  });

  it('includes fee_recipient when royaltyRecipient is set', () => {
    const clip = { ...baseClip, royaltyRecipient: 'GABC...XYZ' };
    const result = service.build(clip);

    expect(result.fee_recipient).toBe('GABC...XYZ');
    expect(result.royalty.recipient).toBe('GABC...XYZ');
  });

  it('includes assetContractId when royalty asset has a contractId', () => {
    mockRoyaltyConfig.getRoyaltyAsset.mockReturnValue({
      code: 'USDC',
      contractId: 'CABC123',
    });
    const result = service.build(baseClip);

    expect(result.royalty.asset).toBe('USDC');
    expect(result.royalty.assetContractId).toBe('CABC123');
  });
});
