import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { WalletNotFoundException } from '../exceptions/wallet-not-found.exception';
import { DuplicateWalletException } from '../exceptions/duplicate-wallet.exception';
import { SyncInProgressException } from '../exceptions/sync-in-progress.exception';
import { RateLimitExceededException } from '../exceptions/rate-limit-exceeded.exception';
import { ForbiddenCategoryException } from '../exceptions/forbidden-category.exception';
import { InvalidCursorException } from '../exceptions/invalid-cursor.exception';
import { PromptParseException } from '../exceptions/prompt-parse.exception';
import { AlchemyApiException } from '../exceptions/alchemy-api.exception';

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: any[];
  needsClarification?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    const problem = this.toProblemDetail(exception);
    this.logger.error(
      `${problem.status} ${problem.title}: ${problem.detail}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(problem.status).json(problem);
  }

  private toProblemDetail(exception: unknown): ProblemDetail {
    if (exception instanceof WalletNotFoundException) {
      return {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: exception.message,
      };
    }

    if (exception instanceof DuplicateWalletException) {
      return {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: exception.message,
      };
    }

    if (exception instanceof SyncInProgressException) {
      return {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: exception.message,
      };
    }

    if (exception instanceof RateLimitExceededException) {
      return {
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: exception.message,
      };
    }

    if (exception instanceof ForbiddenCategoryException) {
      return {
        type: 'https://example.com/problems/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: exception.message,
      };
    }

    if (exception instanceof InvalidCursorException) {
      return {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: exception.message,
      };
    }

    if (exception instanceof PromptParseException) {
      return {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: exception.message,
        needsClarification: exception.needsClarification,
      };
    }

    if (exception instanceof AlchemyApiException) {
      return {
        type: 'about:blank',
        title: 'Bad Gateway',
        status: 502,
        detail: exception.message,
      };
    }

    if (exception instanceof BadRequestException) {
      const exResponse = exception.getResponse() as any;
      const errors = Array.isArray(exResponse.message)
        ? exResponse.message
        : [exResponse.message || exResponse];
      return {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors,
      };
    }

    if (exception instanceof HttpException) {
      return {
        type: 'about:blank',
        title: exception.message,
        status: exception.getStatus(),
        detail: exception.message,
      };
    }

    return {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Internal server error',
    };
  }
}
