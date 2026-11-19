import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PaginatedResult, paginateQuery } from '../query-helpers';

export type UserPayload<T extends Prisma.UserSelect | undefined = undefined> = Prisma.UserGetPayload<{
  select: T extends Prisma.UserSelect ? T : Prisma.UserSelect;
}>;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById<T extends Prisma.UserSelect | undefined>(
    id: number,
    select?: T,
  ): Promise<UserPayload<T> | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: (select ?? {
        id: true,
        email: true,
        name: true,
        picture: true,
      }) as Prisma.UserSelect,
    }) as Promise<UserPayload<T> | null>;
  }

  async findByEmail<T extends Prisma.UserSelect | undefined>(
    email: string,
    select?: T,
  ): Promise<UserPayload<T> | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: (select ?? {
        id: true,
        email: true,
        name: true,
      }) as Prisma.UserSelect,
    }) as Promise<UserPayload<T> | null>;
  }

  async findByProvider<T extends Prisma.UserSelect | undefined>(
    provider: string,
    providerId: string,
    select?: T,
  ): Promise<UserPayload<T> | null> {
    return this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
      select: (select ?? {
        id: true,
        email: true,
        provider: true,
        providerId: true,
      }) as Prisma.UserSelect,
    }) as Promise<UserPayload<T> | null>;
  }

  async list<T extends Prisma.UserSelect | undefined>(
    where: Prisma.UserWhereInput = {},
    page?: number,
    limit?: number,
    select?: T,
  ): Promise<PaginatedResult<UserPayload<T>>> {
    const userSelect = (select ?? {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    }) as Prisma.UserSelect;

    return paginateQuery<UserPayload<T>>(
      ({ skip, take }) =>
        this.prisma.user.findMany({
          where,
          select: userSelect,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
        }) as Promise<UserPayload<T>[]>,
      () => this.prisma.user.count({ where }),
      page,
      limit,
    );
  }
}
