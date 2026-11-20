import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

export interface LeaderboardEntry {
  rank: number;
  userId: number | null;
  displayName: string;
  totalEarnings: number | null;
  anonymized: boolean;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  anonymize: boolean;
  earningsExact: boolean;
  updatedAt: string;
}

export interface LeaderboardQueryOptions {
  page?: number;
  limit?: number;
  /** When true, hide real usernames and user IDs. */
  anonymize?: boolean;
  /**
   * When true, round earnings into ranges instead of exact amounts.
   * Exact amounts are shown by default.
   */
  anonymizeEarnings?: boolean;
}

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly cacheKeyPrefix = 'leaderboard';
  private readonly cacheTtlSeconds = 3600; // 1 hour
  private readonly defaultLimit = 20;
  private readonly maxLimit = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Get top creators leaderboard.
   * Only includes users who have opted in (showOnLeaderboard = true).
   * Soft-deleted earnings are excluded from aggregation.
   */
  async getLeaderboard(
    options: LeaderboardQueryOptions = {},
  ): Promise<LeaderboardResponse> {
    if (!this.config.leaderboardEnabled) {
      throw new ServiceUnavailableException(
        'Earnings leaderboard is currently disabled',
      );
    }

    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(
      Math.max(options.limit ?? this.defaultLimit, 1),
      this.maxLimit,
    );
    const anonymize = options.anonymize ?? true;
    const anonymizeEarnings = options.anonymizeEarnings ?? false;
    const offset = (page - 1) * limit;

    const cacheKey = `${this.cacheKeyPrefix}:p${page}:l${limit}:a${anonymize ? 1 : 0}:e${anonymizeEarnings ? 1 : 0}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as LeaderboardResponse;
      }
    } catch (err) {
      this.logger.warn(
        `Leaderboard cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.log(
      `Fetching leaderboard page=${page} limit=${limit} anonymize=${anonymize}`,
    );

    const [rows, totalResult] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          user_id: number;
          name: string | null;
          email: string;
          total_earnings: number;
        }>
      >`
        SELECT
          u.id as user_id,
          u.name,
          u.email,
          COALESCE(SUM(e.amount), 0) as total_earnings
        FROM "User" u
        INNER JOIN "Video" v ON u.id = v."userId"
        INNER JOIN "Clip" c ON v.id = c."videoId"
        INNER JOIN "Earning" e ON c.id = e."clipId" AND e."deletedAt" IS NULL
        WHERE u."showOnLeaderboard" = true
        GROUP BY u.id, u.name, u.email
        HAVING SUM(e.amount) > 0
        ORDER BY total_earnings DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM (
          SELECT u.id
          FROM "User" u
          INNER JOIN "Video" v ON u.id = v."userId"
          INNER JOIN "Clip" c ON v.id = c."videoId"
          INNER JOIN "Earning" e ON c.id = e."clipId" AND e."deletedAt" IS NULL
          WHERE u."showOnLeaderboard" = true
          GROUP BY u.id
          HAVING SUM(e.amount) > 0
        ) opted_in
      `,
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const entries: LeaderboardEntry[] = rows.map((user, index) => {
      const rank = offset + index + 1;
      const exactEarnings = Number(user.total_earnings);
      const displayName = anonymize
        ? `Creator #${rank}`
        : user.name || user.email.split('@')[0] || `user_${user.user_id}`;

      return {
        rank,
        userId: anonymize ? null : user.user_id,
        displayName,
        totalEarnings: anonymizeEarnings
          ? this.anonymizeEarningsAmount(exactEarnings)
          : exactEarnings,
        anonymized: anonymize,
      };
    });

    const response: LeaderboardResponse = {
      data: entries,
      page,
      limit,
      total,
      totalPages,
      anonymize,
      earningsExact: !anonymizeEarnings,
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.redis.setex(
        cacheKey,
        this.cacheTtlSeconds,
        JSON.stringify(response),
      );
    } catch (err) {
      this.logger.warn(
        `Leaderboard cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return response;
  }

  /**
   * Get user's rank on the leaderboard
   */
  async getUserRank(userId: number): Promise<{
    rank: number | null;
    totalEarnings: number;
    showOnLeaderboard: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, showOnLeaderboard: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const earningsResult = await this.prisma.earning.aggregate({
      where: {
        clip: {
          video: { userId },
        },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const userEarnings = earningsResult._sum.amount ?? 0;

    if (!user.showOnLeaderboard || userEarnings === 0) {
      return {
        rank: null,
        totalEarnings: userEarnings,
        showOnLeaderboard: user.showOnLeaderboard,
      };
    }

    const rankResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM (
        SELECT SUM(e.amount) as total_earnings
        FROM "User" u
        INNER JOIN "Video" v ON u.id = v."userId"
        INNER JOIN "Clip" c ON v.id = c."videoId"
        INNER JOIN "Earning" e ON c.id = e."clipId" AND e."deletedAt" IS NULL
        WHERE u."showOnLeaderboard" = true
        GROUP BY u.id
        HAVING SUM(e.amount) > ${userEarnings}
      ) as ranked_users
    `;

    const rank = Number(rankResult[0]?.count ?? 0) + 1;

    return {
      rank,
      totalEarnings: userEarnings,
      showOnLeaderboard: user.showOnLeaderboard,
    };
  }

  /**
   * Enable/disable leaderboard visibility for a user (privacy opt-in).
   */
  async setLeaderboardVisibility(
    userId: number,
    visible: boolean,
  ): Promise<{ showOnLeaderboard: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { showOnLeaderboard: visible },
      select: { showOnLeaderboard: true },
    });

    await this.invalidateLeaderboardCache();

    this.logger.log(
      `Updated leaderboard visibility for user ${userId}: ${visible}`,
    );

    return user;
  }

  async invalidateLeaderboardCache(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const keys: string[] = await client.keys(`${this.cacheKeyPrefix}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate leaderboard cache: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Round earnings into coarse buckets for anonymized display. */
  private anonymizeEarningsAmount(amount: number): number {
    if (amount < 100) return Math.floor(amount / 10) * 10;
    if (amount < 1000) return Math.floor(amount / 50) * 50;
    if (amount < 10000) return Math.floor(amount / 100) * 100;
    return Math.floor(amount / 500) * 500;
  }
}
