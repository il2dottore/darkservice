import { HttpStatus } from '@nestjs/common';

type RuntimeExceptionResponse = string | Record<string, unknown>;

/**
 * Runtime/domain error that does not depend on Nest's HTTP exception classes.
 *
 * Services can throw these errors without coupling their behavior to HTTP.
 * The global HTTP exception filter maps them to the appropriate response.
 */
export class RuntimeException extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: RuntimeExceptionResponse,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends RuntimeException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthorizedError extends RuntimeException {
  constructor(message: string) {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenError extends RuntimeException {
  constructor(message: string, response?: Record<string, unknown>) {
    super(message, HttpStatus.FORBIDDEN, response);
  }
}

export class NotFoundError extends RuntimeException {
  constructor(message: string) {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends RuntimeException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT);
  }
}
