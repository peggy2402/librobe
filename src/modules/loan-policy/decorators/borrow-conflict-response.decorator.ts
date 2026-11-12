import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { BorrowLimitErrorDto } from '../dto/borrow-limit-error.dto.js';

/** Stock/state conflicts keep their existing envelope; limit conflicts add details. */
export function ApiBorrowConflictResponse(description: string) {
  return applyDecorators(
    ApiExtraModels(BorrowLimitErrorDto),
    ApiConflictResponse({
      description,
      schema: {
        anyOf: [
          { $ref: getSchemaPath(BorrowLimitErrorDto) },
          {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
              statusCode: { type: 'integer', enum: [409] },
              message: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                ],
              },
            },
          },
        ],
      },
    }),
  );
}
