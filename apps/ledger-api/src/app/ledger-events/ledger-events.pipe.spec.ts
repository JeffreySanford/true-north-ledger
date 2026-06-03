import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './ledger-events.pipe';

describe('ZodValidationPipe', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number().min(0),
    email: z.string().email(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(testSchema);
  });

  it('should pass through valid data', () => {
    const validData = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com',
    };

    const result = pipe.transform(validData, { type: 'body' });

    expect(result).toEqual(validData);
  });

  it('should throw BadRequestException for invalid data', () => {
    const invalidData = {
      name: 'John Doe',
      age: -5, // Invalid: negative age
      email: 'not-an-email', // Invalid: not an email
    };

    expect(() => pipe.transform(invalidData, { type: 'body' })).toThrow(BadRequestException);
  });

  it('should throw BadRequestException with formatted error details', () => {
    const invalidData = {
      name: 123, // Invalid: should be string
      age: 'thirty', // Invalid: should be number
      email: 'john@example.com',
    };

    try {
      pipe.transform(invalidData, { type: 'body' });
      fail('Expected BadRequestException to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as any;
      expect(response.message).toBe('Validation failed');
      expect(response.details).toBeDefined();
    }
  });

  it('should throw BadRequestException for missing required fields', () => {
    const incompleteData = {
      name: 'John Doe',
      // Missing age and email
    };

    expect(() => pipe.transform(incompleteData, { type: 'body' })).toThrow(BadRequestException);
  });

  it('should handle empty object validation', () => {
    const emptyData = {};

    expect(() => pipe.transform(emptyData, { type: 'body' })).toThrow(BadRequestException);
  });

  it('should rethrow non-Zod errors', () => {
    const malformedPipe = new ZodValidationPipe({
      parse: () => {
        throw new Error('Custom non-Zod error');
      },
    } as any);

    expect(() => malformedPipe.transform({}, { type: 'body' })).toThrow('Custom non-Zod error');
  });
});
