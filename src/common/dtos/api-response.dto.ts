export class ApiResponseDto<T = any> {
  statusCode: number;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;

  constructor(props: {
    statusCode: number;
    message: string;
    data?: T;
    error?: string;
  }) {
    this.statusCode = props.statusCode;
    this.message = props.message;
    this.data = props.data;
    this.error = props.error;
    this.timestamp = new Date().toISOString();
  }

  static success<U>(data: U, message: string = 'Success'): ApiResponseDto<U> {
    return new ApiResponseDto({
      statusCode: 200,
      message,
      data,
    });
  }

  static created<U>(data: U, message: string = 'Created'): ApiResponseDto<U> {
    return new ApiResponseDto({
      statusCode: 201,
      message,
      data,
    });
  }

  static error(
    statusCode: number,
    message: string,
    error?: string,
  ): ApiResponseDto {
    return new ApiResponseDto({
      statusCode,
      message,
      error: error || message,
    });
  }
}
