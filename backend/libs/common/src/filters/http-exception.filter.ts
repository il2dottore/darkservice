import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorDto } from '../dtos/api-response.dto';
import { RuntimeException } from '../exceptions/runtime.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const isRuntimeException = exception instanceof RuntimeException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : isRuntimeException
        ? exception.statusCode
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : isRuntimeException
        ? (exception.response ?? exception.message)
        : null;
    const message = this.extractMessage(exceptionResponse, exception);
    const errors = this.extractValidationErrors(exceptionResponse);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${statusCode}: ${message}`,
      );
    }

    response
      .status(statusCode)
      .json(new ApiErrorDto(statusCode, message, request.url, errors));
  }

  private extractMessage(
    exceptionResponse: unknown,
    exception: unknown,
  ): string {
    if (typeof exceptionResponse === 'string') return exceptionResponse;
    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const msg = (exceptionResponse as { message: string | string[] }).message;
      return Array.isArray(msg) ? msg.join(', ') : msg;
    }
    return (exception as Error)?.message ?? 'Internal server error';
  }

  private extractValidationErrors(
    exceptionResponse: unknown,
  ): Record<string, string[]> | undefined {
    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      Array.isArray((exceptionResponse as { message: unknown }).message)
    ) {
      return {
        validation: (exceptionResponse as { message: string[] }).message,
      };
    }
    return undefined;
  }
}
