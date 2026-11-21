import { Injectable, ConflictException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { maskAddress } from '@clipcash/shared';
import { UsernameAvailabilityService } from './username-availability.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly usernames: UsernameAvailabilityService,
  ) {}

  /** Set/update the user's username; unchanged usernames are allowed, duplicates return 409. */
  async updateUsername(userId: number, username: string) {
    const value = this.usernames.normalize(username);
    return this.usernames.withUniqueUsername(
      value,
      () =>
        this.prisma.user.update({
          where: { id: userId },
          data: { username: value },
          select: { id: true, username: true },
        }),
      userId,
    );
  }

  /** Generate and persist a Stellar custodial wallet for a user. Idempotent. */
  async createWallet(userId: number): Promise<{ stellarPublicKey: string; walletType: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (user?.stellarPublicKey) {
      throw new ConflictException('Wallet already exists for this user');
    }

    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const encryptedSecret = this.encryption.encrypt(keypair.secret());

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        stellarPublicKey: publicKey,
        walletType: 'custodial',
        encryptedStellarSecret: encryptedSecret,
      },
    });

    return { stellarPublicKey: maskAddress(publicKey), walletType: 'custodial' };
  }

  /** Return the current user's profile including a masked Stellar public key. */
  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        bio: true,
        picture: true,
        emailVerified: true,
        stellarPublicKey: true,
        walletType: true,
        showOnLeaderboard: true,
        createdAt: true,
      },
    });

    if (!user) {
      return user;
    }

    return {
      ...user,
      stellarPublicKey: user.stellarPublicKey
        ? maskAddress(user.stellarPublicKey)
        : user.stellarPublicKey,
    };
  }

  /** Partially update the profile; fields missing from the DTO are not touched. */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const data: Record<string, string> = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.displayName !== undefined) data.name = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.picture !== undefined) data.picture = dto.picture;

    if (data.username) {
      const taken = await this.prisma.user.findFirst({
        where: { username: data.username, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Username already taken');
    }

    if (Object.keys(data).length) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }
    return this.getMe(userId);
  }
}
