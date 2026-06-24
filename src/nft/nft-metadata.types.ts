export interface NftMetadataAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url?: string;
  attributes: NftMetadataAttribute[];
}

export type IpfsProvider = 'pinata' | 'nftstorage';
