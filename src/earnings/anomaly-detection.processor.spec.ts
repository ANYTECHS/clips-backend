import { Job } from 'bullmq';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { ANOMALY_DETECTION_QUEUE } from './anomaly-detection.queue';

jest.mock('../metrics/metrics.service', () => ({ MetricsService: class {} }));

const mockAnomalyDetectionService = { detectAnomalies: jest.fn() };
const mockMailService = { sendEmail: jest.fn() };
const mockMetricsService = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};

function makeProcessor() {
  return new AnomalyDetectionProcessor(
    mockAnomalyDetectionService as any,
    mockMailService as any,
    mockMetricsService as any,
  );
}

function makeJob(earningId = 99): Job<{ earningId: number }> {
  return {
    id: 'anomaly-job-1',
    data: { earningId },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as unknown as Job<{ earningId: number }>;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe('AnomalyDetectionProcessor.process()', () => {
  it('calls detectAnomalies with the earningId from job data', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({ isAnomaly: false });
    const processor = makeProcessor();

    await processor.process(makeJob(99));

    expect(mockAnomalyDetectionService.detectAnomalies).toHaveBeenCalledWith(99);
  });

  it('records job start and completion(success) metrics', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({ isAnomaly: false });
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockMetricsService.recordJobStart).toHaveBeenCalled();
    expect(mockMetricsService.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      ANOMALY_DETECTION_QUEUE,
      'success',
    );
    expect(mockMetricsService.recordJobFailure).not.toHaveBeenCalled();
  });

  it('does not call sendEmail when no anomaly is detected', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({ isAnomaly: false });
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockMailService.sendEmail).not.toHaveBeenCalled();
  });

  it('does not send admin notification for low-severity anomaly', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({
      isAnomaly: true,
      severity: 'low',
      reason: 'slightly above average',
    });
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockMailService.sendEmail).not.toHaveBeenCalled();
  });

  it('notifies admins for high-severity anomaly', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({
      isAnomaly: true,
      severity: 'high',
      reason: 'Z-score > 5',
    });
    mockMailService.sendEmail.mockResolvedValue(undefined);
    process.env.ADMIN_EMAILS = 'admin@example.com,ops@example.com';
    const processor = makeProcessor();

    await processor.process(makeJob());

    expect(mockMailService.sendEmail).toHaveBeenCalledTimes(2);
    expect(mockMailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: expect.stringContaining('HIGH'),
        text: expect.stringContaining('Z-score > 5'),
      }),
    );
  });

  it('does not throw when ADMIN_EMAILS is not set and anomaly is high-severity', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({
      isAnomaly: true,
      severity: 'high',
      reason: 'spike',
    });
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).resolves.not.toThrow();
    expect(mockMailService.sendEmail).not.toHaveBeenCalled();
  });

  it('records failure metric and rethrows when detectAnomalies throws', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockRejectedValue(
      new Error('DB connection lost'),
    );
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).rejects.toThrow('DB connection lost');

    expect(mockMetricsService.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      ANOMALY_DETECTION_QUEUE,
      'failure',
    );
    expect(mockMetricsService.recordJobFailure).toHaveBeenCalled();
  });

  it('continues processing remaining admins when one notification fails', async () => {
    mockAnomalyDetectionService.detectAnomalies.mockResolvedValue({
      isAnomaly: true,
      severity: 'high',
      reason: 'spike',
    });
    mockMailService.sendEmail
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValueOnce(undefined);
    process.env.ADMIN_EMAILS = 'bad@example.com,good@example.com';
    const processor = makeProcessor();

    await expect(processor.process(makeJob())).resolves.not.toThrow();
    expect(mockMailService.sendEmail).toHaveBeenCalledTimes(2);
  });
});
