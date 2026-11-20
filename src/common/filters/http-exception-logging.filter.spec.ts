import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionLoggingFilter } from './http-exception-logging.filter';
import { AppLoggerService } from '../../logger/logger.service';

describe('HttpExceptionLoggingFilter', () => {
  let filter: HttpExceptionLoggingFilter;
  let logger: AppLoggerService;
  let json: jest.Mock;
  let status: jest.Mock;

  const createHost = (requestId?: string): ArgumentsHost => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          requestId,
          method: 'GET',
          url: '/test',
          originalUrl: '/test',
        }),
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    logger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    } as unknown as AppLoggerService;
    filter = new HttpExceptionLoggingFilter(logger);
  });

  it('adds requestId and strips stack from HttpException responses', () => {
    const host = createHost('corr-123');
    filter.catch(
      new HttpException(
        { statusCode: 400, message: 'bad', stack: 'secret-stack' },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'bad',
        requestId: 'corr-123',
      }),
    );
    expect(json.mock.calls[0][0].stack).toBeUndefined();
  });

  it('masks unexpected errors as 500 without exposing internals', () => {
    const host = createHost('corr-456');
    filter.catch(new Error('db blew up'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        requestId: 'corr-456',
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
