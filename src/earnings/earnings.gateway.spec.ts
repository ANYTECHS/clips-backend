import { Test, TestingModule } from '@nestjs/testing';
import { EarningsGateway } from './earnings.gateway';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('EarningsGateway', () => {
  let gateway: EarningsGateway;
  const setex = jest.fn();
  const del = jest.fn();

  beforeEach(async () => {
    setex.mockReset();
    del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn().mockReturnValue({ userId: 1 }) },
        },
        {
          provide: PrismaService,
          useValue: {
            earning: {
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 325.5 } }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            payout: {
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          },
        },
        {
          provide: RedisService,
          useValue: { setex, get: jest.fn(), del },
        },
      ],
    }).compile();

    gateway = module.get(EarningsGateway);
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('emitEarningsUpdated', () => {
    it('does nothing when no sockets for user', async () => {
      await gateway.emitEarningsUpdated(999, { total: 100, currency: 'USD' });
      expect(setex).toHaveBeenCalled();
    });

    it('broadcasts to connected sockets for the user', async () => {
      const emit = jest.fn();
      (gateway as any).userSockets.set(1, new Set(['sock-1']));
      (gateway as any).server = {
        to: jest.fn().mockReturnValue({ emit }),
      };

      await gateway.emitEarningsUpdated(1, {
        event: 'earnings.updated',
        userId: 'user_1',
        currency: 'USD',
        amount: 25.5,
        total: 325.5,
      });

      expect((gateway as any).server.to).toHaveBeenCalledWith('sock-1');
      expect(emit).toHaveBeenCalledWith('earnings.updated', expect.objectContaining({
        event: 'earnings.updated',
        amount: 25.5,
        total: 325.5,
      }));
    });
  });

  describe('handleEarningsUpdated', () => {
    it('invalidates cache and emits earnings.updated payload', async () => {
      const emitSpy = jest.spyOn(gateway, 'emitEarningsUpdated').mockResolvedValue();

      await gateway.handleEarningsUpdated({
        userId: 1,
        amount: 25.5,
        currency: 'USD',
      });

      expect(del).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          event: 'earnings.updated',
          userId: 'user_1',
          currency: 'USD',
          amount: 25.5,
          total: 325.5,
        }),
      );
    });
  });

  describe('handleDisconnect', () => {
    it('removes socket mapping for disconnected clients', () => {
      (gateway as any).userSockets.set(1, new Set(['sock-1', 'sock-2']));
      gateway.handleDisconnect({ userId: 1, id: 'sock-1' } as any);
      expect((gateway as any).userSockets.get(1)?.has('sock-1')).toBe(false);
      expect((gateway as any).userSockets.get(1)?.has('sock-2')).toBe(true);
    });
  });
});
