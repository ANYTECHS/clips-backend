export interface PlatformEarning {
  platform: string;
  totalEarnings: number;
  count: number;
}

export interface EarningsByPlatformResponse {
  data: PlatformEarning[];
  totalEarnings: number;
}
