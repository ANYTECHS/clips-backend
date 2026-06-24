import { ConfigService } from '@nestjs/config';
import { QueueCleanupService } from './queue-cleanup.service';

const mockClean = jest.fn();
const mockClose = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    clean: mockClean,
    close: mockClose,
  })),
}));

describe('QueueCleanupService', () => {
  beforeEach(() => {
    mockClean.mockReset();
    mockClose.mockReset();
  });

  it('cleans completed jobs using default retention when env is unset', async () => {
    mockClean.mockResolvedValue([]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).toHaveBeenCalledTimes(2);
    expect(mockClean).toHaveBeenCalledWith(30 * 24 * 60 * 60 * 1000, 1000, 'completed');
  });

  it('cleans completed jobs using configured retention days', async () => {
    mockClean.mockResolvedValue([]);
    const configService = {
      get: jest.fn((key: string) => (key === 'BULL_JOB_RETENTION_DAYS' ? '15' : undefined)),
    } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).toHaveBeenCalledTimes(2);
    expect(mockClean).toHaveBeenCalledWith(15 * 24 * 60 * 60 * 1000, 1000, 'completed');
  });
});
