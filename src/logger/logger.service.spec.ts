import { AppLoggerService } from './logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    service = new AppLoggerService();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it('outputs JSON in production', () => {
    service.log('hello world', 'TestCtx');
    expect(stdoutSpy).toHaveBeenCalled();
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello world');
    expect(parsed.context).toBe('TestCtx');
    expect(parsed.timestamp).toBeDefined();
  });

  it('redacts sensitive fields', () => {
    service.log('user login', { password: 'secret123', email: 'user@example.com' });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.email).toBe('user@example.com');
  });

  it('redacts token fields', () => {
    service.log('token issued', { accessToken: 'abc.def.ghi', userId: 1 });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.userId).toBe(1);
  });

  it('redacts payout destination details, including nested fields', () => {
    const sensitiveValues = {
      accountNumber: '1234567890',
      routingNumber: '021000021',
      swiftCode: 'CHASUS33',
      iban: 'GB29NWBK60161331926819',
      accountHolderName: 'John Doe',
      bankName: 'Chase Bank',
      lastFourDigits: '7890',
    };

    service.log('payout method updated', {
      payoutMethod: sensitiveValues,
    });

    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.payoutMethod).toEqual({
      accountNumber: '[REDACTED]',
      routingNumber: '[REDACTED]',
      swiftCode: '[REDACTED]',
      iban: '[REDACTED]',
      accountHolderName: '[REDACTED]',
      bankName: '[REDACTED]',
      lastFourDigits: '[REDACTED]',
    });
    for (const value of Object.values(sensitiveValues)) {
      expect(raw).not.toContain(value);
    }
  });

  it('includes requestId when provided', () => {
    service.log('request handled', { requestId: 'req-uuid-123' });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.requestId).toBe('req-uuid-123');
  });

  it('respects LOG_LEVEL — suppresses debug when level is warn', () => {
    process.env.LOG_LEVEL = 'warn';
    service = new AppLoggerService();
    service.debug('should not appear');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
