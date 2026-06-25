export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  XLM = 'XLM',
  USDC = 'USDC',
}

export interface EarningsBreakdown {
  royalties: number;
  subscriptions: number;
}

export interface UserTotalEarnings {
  total: number;
  currency: Currency;
  breakdown: EarningsBreakdown;
}

export interface EarningsHistoryItem {
  date: string;
  amount: number;
  currency: Currency;
  type: 'royalty' | 'subscription' | 'payout';
}

export interface EarningsDashboard {
  totalEarned: number;
  currency: Currency;
  pendingPayout: number;
  paidOut: number;
  breakdown: EarningsBreakdown;
  history: EarningsHistoryItem[];
}

export interface EarningsPeriodItem {
  id: number;
  amount: number;
  currency: Currency;
  source: string | null;
  date: string;
  clipTitle: string | null;
}

export interface EarningsByPeriod {
  startDate: string;
  endDate: string;
  total: number;
  currency: Currency;
  breakdown: EarningsBreakdown;
  items: EarningsPeriodItem[];
}

export interface DetailedRevenueBreakdown {
  subscriptions: number;
  nftSales: number;
  royalties: number;
  other: number;
}
