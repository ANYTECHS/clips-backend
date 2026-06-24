import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the raw request body (Buffer)
 * Used for webhook signature verification where the raw body is needed
 * Must be used with body-parser.raw() middleware
 */
export const RawBody = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Buffer => {
    const request = ctx.switchToHttp().getRequest();
    // body-parser.raw() stores the raw body in request.body as a Buffer
    return request.body;
  },
);
