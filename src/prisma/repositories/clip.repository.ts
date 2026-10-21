import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PaginatedResult, clipListSelect, paginateQuery } from '../query-helpers';

export type ClipPayload = Prisma.ClipGetPayload<{ select: typeof clipListSelect }>;

/**
 * Centralized Clip queries (Issue #1237).
 * Consolidates ~10 copies of `clip.findUnique({ where: { id } })` plus the
 * `video.userId` ownership include, and the paginated `listClips` query.
 * Response contracts are unchanged — only the query construction is shared.
 */
@Injectable()
export class ClipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<ClipPayload | null> {
    return this.prisma.clip.findMany({
      where: { id },
      select: clipListSelect,
      take: 1,
    }).then((rows) => (rows[0] as ClipPayload | undefined) ?? null);
  }

  async findByIdWithOwner(
    id: number,
  ): Promise<(ClipPayload & { video: { userId: number } }) | null> {
    return this.prisma.clip.findUnique({
      where: { id },
      select: {
        ...clipListSelect,
        video: { select: { userId: true } },
      },
    }) as Promise<(ClipPayload & { video: { userId: number } }) | null>;
  }

  async findManyByIds(ids: number[]): Promise<ClipPayload[]> {
    return this.prisma.clip.findMany({
      where: { id: { in: ids } },
      select: {
        ...clipListSelect,
        video: { select: { userId: true } },
      },
    }) as Promise<ClipPayload[]>;
  }

  async list(
    where: Prisma.ClipWhereInput = {},
    orderBy: Prisma.ClipOrderByWithRelationInput | Prisma.ClipOrderByWithRelationInput[] = {
      createdAt: 'desc',
    },
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<ClipPayload>> {
    return paginateQuery<ClipPayload>(
      ({ skip, take }) =>
        this.prisma.clip.findMany({
          where,
          orderBy,
          skip,
          take,
          select: clipListSelect,
        }) as Promise<ClipPayload[]>,
      () => this.prisma.clip.count({ where }),
      page,
      limit,
    );
  }
}
