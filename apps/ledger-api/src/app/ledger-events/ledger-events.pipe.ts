import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema<unknown>) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    void metadata;
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({ message: 'Validation failed', details: error.format() });
      }

      throw error;
    }
  }
}
