import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Reusable username uniqueness checks. The DB unique index is the source of truth. */
@Injectable()
export class UsernameAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(username: string): string {
    return username.trim();
  }

  /** True when no other user (excluding `excludeUserId`) holds the username. */
  async isAvailable(username: string, excludeUserId?: number): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        username: { equals: this.normalize(username), mode: 'insensitive' },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return !existing;
  }

  /** Throws 409 when the username is taken by another user. */
  async assertAvailable(username: string, excludeUserId?: number): Promise<void> {
    if (!(await this.isAvailable(username, excludeUserId))) {
      throw new ConflictException('Username is already taken');
    }
  }

  /** Maps Prisma unique-constraint violations (P2002) on username to 409 (handles races). */
  handleConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '').includes('username')
    ) {
      throw new ConflictException('Username is already taken');
    }
    throw error;
  }

  /** Check, then run the write; DB constraint conflicts are mapped to 409. */
  async withUniqueUsername<T>(username: string, write: () => Promise<T>, excludeUserId?: number): Promise<T> {
    await this.assertAvailable(username, excludeUserId);
    try {
      return await write();
    } catch (error) {
      return this.handleConflict(error);
    }
  }
}
