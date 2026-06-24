import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserPlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number): Promise<Array<{ platform: string }>> {
    const platforms = await this.prisma.userPlatform.findMany({
      where: { userId },
      select: { platform: true },
    });
    return platforms;
  }

  async migrateExistingRecords(): Promise<{ migrated: number }> {
    return { migrated: 0 };
  }
}
