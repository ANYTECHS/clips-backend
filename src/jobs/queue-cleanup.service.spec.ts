import { ConfigService } from '@nestjs/config';
import { QueueCleanupService } from './queue-cleanup.service';
import { Job } from 'bullmq';

const mockClean = jest.fn();
const mockClose = jest.fn();
const mockGetFailed = jest.fn();
const mockRemove = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    clean: mockClean,
    close: mockClose,
    getFailed: mockGetFailed,
    remove: mockRemove,
  })),
}));

describe('QueueCleanupService', () => {
  beforeEach(() => {
    mockClean.mockReset();
    mockClose.mockReset();
    mockGetFailed.mockReset();
    mockRemove.mockReset();
  });

  it('cleans completed jobs using default retention when env is unset', async () => {
    mockClean.mockResolvedValue([]);
    mockGetFailed.mockResolvedValue([]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).toHaveBeenCalledTimes(10);
    expect(mockClean).toHaveBeenCalledWith(30 * 24 * 60 * 60 * 1000, 1000, 'completed');
  });

  it('cleans completed jobs using configured retention days', async () => {
    mockClean.mockResolvedValue([]);
    mockGetFailed.mockResolvedValue([]);
    const configService = {
      get: jest.fn((key: string) => (key === 'BULL_JOB_RETENTION_DAYS' ? '15' : undefined)),
    } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).toHaveBeenCalledTimes(10);
    expect(mockClean).toHaveBeenCalledWith(15 * 24 * 60 * 60 * 1000, 1000, 'completed');
  });

  it('cleans all 5 registered queues', async () => {
    mockClean.mockResolvedValue([]);
    mockGetFailed.mockResolvedValue([]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).toHaveBeenCalledTimes(10);
  });

  it('preserves failed jobs with preserve flag', async () => {
    mockClean.mockResolvedValue([]);
    const oldJob = {
      id: '1',
      name: 'test-job',
      data: { preserve: true },
      finishedOn: Date.now() - 100 * 24 * 60 * 60 * 1000,
    } as Job;
    mockGetFailed.mockResolvedValue([oldJob]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('preserves failed jobs with requiresManualIntervention flag', async () => {
    mockClean.mockResolvedValue([]);
    const oldJob = {
      id: '1',
      name: 'test-job',
      data: { requiresManualIntervention: true },
      finishedOn: Date.now() - 100 * 24 * 60 * 60 * 1000,
    } as Job;
    mockGetFailed.mockResolvedValue([oldJob]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('removes failed jobs older than retention period without preserve flags', async () => {
    mockClean.mockResolvedValue([]);
    const oldJob = {
      id: '1',
      name: 'test-job',
      data: {},
      finishedOn: Date.now() - 100 * 24 * 60 * 60 * 1000,
    } as Job;
    mockGetFailed.mockResolvedValue([oldJob]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockRemove).toHaveBeenCalledWith('1');
  });

  it('preserves failed jobs younger than retention period', async () => {
    mockClean.mockResolvedValue([]);
    const recentJob = {
      id: '1',
      name: 'test-job',
      data: {},
      finishedOn: Date.now() - 10 * 24 * 60 * 60 * 1000,
    } as Job;
    mockGetFailed.mockResolvedValue([recentJob]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('skips cleanup when Redis is unavailable', async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(false) };
    const service = new QueueCleanupService(configService, redisService as any);

    await service.runCleanup();

    expect(mockClean).not.toHaveBeenCalled();
  });

  it('handles cleanup errors gracefully', async () => {
    mockClean.mockRejectedValue(new Error('Redis connection failed'));
    mockGetFailed.mockResolvedValue([]);
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const redisService = { isAvailable: jest.fn().mockReturnValue(true) };
    const service = new QueueCleanupService(configService, redisService as any);

    await expect(service.runCleanup()).resolves.not.toThrow();
  });
});
