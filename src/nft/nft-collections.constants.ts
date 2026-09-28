export const DEFAULT_NFT_COLLECTION_ID = 'viral-clips';

export const NFT_COLLECTION_TYPES = [
  'viral',
  'podcast',
  'comedy',
  'educational',
] as const;

export type NftCollectionType = (typeof NFT_COLLECTION_TYPES)[number];

export const NFT_COLLECTION_DEFINITIONS: Record<
  string,
  { name: string; description: string; type: NftCollectionType }
> = {
  'viral-clips': {
    name: 'Viral Clips',
    description: 'Short-form clips selected for viral potential.',
    type: 'viral',
  },
  'podcast-highlights': {
    name: 'Podcast Highlights',
    description: 'Memorable moments from podcasts and interviews.',
    type: 'podcast',
  },
  'comedy-clips': {
    name: 'Comedy Clips',
    description: 'Comedy moments and standout performances.',
    type: 'comedy',
  },
  'educational-clips': {
    name: 'Educational Clips',
    description: 'Educational clips and explainers.',
    type: 'educational',
  },
};

export function isSupportedNftCollectionId(collectionId: string): boolean {
  return Object.hasOwn(NFT_COLLECTION_DEFINITIONS, collectionId);
}
