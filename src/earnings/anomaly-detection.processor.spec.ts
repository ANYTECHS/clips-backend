import { Job } from 'bullmq';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { ANOMALY_DETECTION_QUEUE } from './anomaly-detection.queue';

jest.mock('../metrics/metrics.service', () => ({ MetricsService: class {} }));

const mockCalculateBaseline = jest.fn();
const mockAnomalyService = { calculateBaseline: mockCalculateBaseline };
const mockPrisma = {
  earning: { update: jest.fn() },
  anomalyAlert: { create: jest.fn() },
};
const mockConfig = { anomalyLookbackDays: 30, anomalyThresholdMultiplier: 3 };
const mockMetrics = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};
const mockShutdown = { register: jest.fn() };

function makeProcessor() {
  return new AnomalyDetectionProcessor(
    mockAnomalyService as never,
    mockPrisma as never,
    mockConfig as never,
    mockMetrics as never,
    mockShutdown as never,
  );
}

function makeJob(data: Record<string, unknown> = {}) {
  return {
    id: 'anomaly-job-1',
    data: { earningId: 1, userId: 7, amount: 100, clipId: 3, ...data },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as unknown as Job;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalculateBaseline.mockResolvedValue({ avgAmount: 10, stdDev: 2, sampleCount: 10 });
  mockPrisma.earning.update.mockResolvedValue({});
  mockPrisma.anomalyAlert.create.mockResolvedValue({});
});

describe('AnomalyDetectionProcessor (Issue #1235)', () => {
  it('records start/success and skips DB writes when below threshold', async () => {
    await makeProcessor().process(makeJob({ amount: 11 }));
    expect(mockMetrics.recordJobStart).toHaveBeenCalled();
    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      ANOMALY_DETECTION_QUEUE,
      'success',
    );
    expect(mockPrisma.earning.update).not.toHaveBeenCalled();
  });

  it('writes anomaly + alert when amount exceeds baseline', async () => {
    await makeProcessor().process(makeJob({ amount: 100 }));
    expect(mockPrisma.earning.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(mockPrisma.anomalyAlert.create).toHaveBeenCalled();
  });

  it('returns early without writes when baseline sample is insufficient', async () => {
    mockCalculateBaseline.mockResolvedValue({ avgAmount: 10, stdDev: 2, sampleCount: 1 });
    await makeProcessor().process(makeJob({ amount: 100 }));
    expect(mockPrisma.earning.update).not.toHaveBeenCalled();
    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      ANOMALY_DETECTION_QUEUE,
      'success',
    );
  });

  it('rejects invalid payloads as permanent failures and records failure metrics', async () => {
    await expect(makeProcessor().process(makeJob({ earningId: undefined }))).rejects.toThrow();
    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      ANOMALY_DETECTION_QUEUE,
      'failure',
    );
    expect(mockMetrics.recordJobFailure).toHaveBeenCalled();
  });

  it('records failure metrics and rethrows when baseline calculation fails', async () => {
    mockCalculateBaseline.mockRejectedValue(new Error('DB down'));
    await expect(makeProcessor().process(makeJob())).rejects.toThrow(
      `[${ANOMALY_DETECTION_QUEUE}:anomaly-job-1] DB down`,
    );
    expect(mockMetrics.recordJobFailure).toHaveBeenCalled();
  });

  it('onFailed only records final_failure on the last attempt', () => {
    const processor = makeProcessor();
    const loggerSpy = jest.spyOn((processor as never as { logger: { warn: jest.Mock; error: jest.Mock } })['logger'], 'warn').mockImplementation(() => undefined);
    const errorLoggerSpy = jest.spyOn((processor as never as { logger: { warn: jest.Mock; error: jest.Mock } })['logger'], 'error').mockImplementation(() => undefined);
    processor.onFailed({ id: '1', opts: { attempts: 3 }, attemptsMade: 1, data: {} } as unknown as Job, new Error('x'));
    expect(mockMetrics.recordJobFailure).not.toHaveBeenCalledWith(ANOMALY_DETECTION_QUEUE, 'final_failure');
    processor.onFailed({ id: '1', opts: { attempts: 3 }, attemptsMade: 3, data: {} } as unknown as Job, new Error('x'));
    expect(mockMetrics.recordJobFailure).toHaveBeenCalledWith(ANOMALY_DETECTION_QUEUE, 'final_failure');
    loggerSpy.mockRestore();
    errorLoggerSpy.mockRestore();
  });
});
