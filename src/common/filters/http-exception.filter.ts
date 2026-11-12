import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Đã có lỗi nội bộ xảy ra trên máy chủ';
    let error = 'Internal Server Error';
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message;
        error = resObj.error || exception.name;
        if (typeof resObj.code === 'string') code = resObj.code;
        if (
          typeof resObj.details === 'object' &&
          resObj.details !== null &&
          !Array.isArray(resObj.details)
        ) {
          details = resObj.details;
        }
      }
    } else if (this.isPrismaError(exception)) {
      // Lỗi tầng dữ liệu được dịch thành thông điệp nghiệp vụ.
      // Chi tiết kỹ thuật (tên bảng, tên cột, câu truy vấn) chỉ ghi vào log
      // phía server, không bao giờ trả về cho client.
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      error = mapped.error;
      message = mapped.message;
      this.logger.error(
        `Prisma error ${(exception as { code?: string }).code ?? 'unknown'} tại ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
      // Không lộ message gốc của lỗi hệ thống ra ngoài.
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(code !== undefined ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }

  private isPrismaError(exception: unknown): boolean {
    return (
      exception instanceof Prisma.PrismaClientKnownRequestError ||
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    );
  }

  private mapPrismaError(exception: unknown): {
    status: HttpStatus;
    error: string;
    message: string;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message:
              'Dữ liệu đã tồn tại trong hệ thống, vui lòng kiểm tra lại thông tin',
          };
        case 'P2003':
        case 'P2014':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message:
              'Không thể thực hiện vì bản ghi đang được tham chiếu bởi dữ liệu khác trong hệ thống',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message:
              'Không tìm thấy bản ghi cần xử lý. Dữ liệu có thể vừa bị thay đổi',
          };
        case 'P2034':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message:
              'Giao dịch bị xung đột do có thao tác đồng thời trên cùng dữ liệu. Vui lòng thử lại',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Yêu cầu không thể thực hiện do dữ liệu không hợp lệ',
          };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Dữ liệu gửi lên không đúng định dạng yêu cầu',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Đã có lỗi nội bộ xảy ra trên máy chủ',
    };
  }
}
