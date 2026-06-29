import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dtos/api-response.dto';
import { SKIP_RESPONSE_WRAP } from './skip-response-wrap.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      map((data) => {
        if (data instanceof ApiResponseDto) return data;

        const statusCode = context.switchToHttp().getResponse().statusCode;
        return statusCode === 201
          ? ApiResponseDto.created(data, 'Created')
          : ApiResponseDto.success(data, 'Success');
      }),
    );
  }
}
