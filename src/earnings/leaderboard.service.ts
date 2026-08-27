import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalEarnings: number;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  updatedAt: Date;
}

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly cacheKeyPrefix = 'leaderboard';
  private readonly cacheTtlSeconds = 3600; // 1 hour

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get top creators leaderboard
   * Only includes users who have opted in (showOnLeaderboard = true)
   *
   * @param limit Number of top creators to return (default 100, max 500)
   */
  async getLeaderboard(limit: number = 100): Promise<LeaderboardResponse> {
    // Validate limit
    const normalizedLimit = Math.min(Math.max(limit, 1), 500);

    this.logger.log(`Fetching leaderboard with limit=${normalizedLimit}`);

    // Aggregate earnings by user, filtered by:
    // 1. showOnLeaderboard = true
    // 2. Only non-deleted earnings
    // 3. From users with at least one clip
    const leaderboardUsers = await this.prisma.$queryRaw<
      Array<{
        user_id: number;
        name: string;
        email: string;
        total_earnings: number;
      }>
    >`
      SELECT 
        u.id as user_id,
        u.name,
        u.email,
        COALESCE(SUM(e.amount), 0) as total_earnings
      FROM 
        "User" u
      INNER JOIN 
        "Video" v ON u.id = v."userId"
      INNER JOIN 
        "Clip" c ON v.id = c."videoId"
      LEFT JOIN 
        "Earning" e ON c.id = e."clipId" AND e."deletedAt" IS NULL
      WHERE 
        u."showOnLeaderboard" = true
      GROUP BY 
        u.id, u.name, u.email
      HAVING 
        SUM(e.amount) > 0
      ORDER BY 
        total_earnings DESC
      LIMIT ${normalizedLimit}
    `;

    // Format response with rankings
    const entries: LeaderboardEntry[] = leaderboardUsers.map(
      (user, index) => ({
        rank: index + 1,
        userId: user.user_id,
        username: user.name || user.email.split('@')[0] || `user_${user.user_id}`,
        totalEarnings: Number(user.total_earnings),
      }),
    );

    this.logger.log(`Leaderboard generated with ${entries.length} entries`);

    return {
      data: entries,
      updatedAt: new Date(),
    };
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

    // Get user's total earnings
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

    // Count how many users have more earnings
    const rankResult = await this.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*) as count
      FROM (
        SELECT SUM(e.amount) as total_earnings
        FROM "User" u
        INNER JOIN "Video" v ON u.id = v."userId"
        INNER JOIN "Clip" c ON v.id = c."videoId"
        LEFT JOIN "Earning" e ON c.id = e."clipId" AND e."deletedAt" IS NULL
        WHERE u."showOnLeaderboard" = true
        GROUP BY u.id
        HAVING SUM(e.amount) > ${userEarnings}
      ) as ranked_users
    `;

    const rank =
      Number(rankResult[0]?.count ?? 0) +
      1;

    return {
      rank,
      totalEarnings: userEarnings,
      showOnLeaderboard: user.showOnLeaderboard,
    };
  }

  /**
   * Enable/disable leaderboard visibility for a user
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

    this.logger.log(
      `Updated leaderboard visibility for user ${userId}: ${visible}`,
    );

    return user;
  }
}
