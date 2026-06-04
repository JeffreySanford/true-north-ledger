import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const getTenantFromContext = (context: ExecutionContext): string | null => {
  const request = context.switchToHttp().getRequest();
  return request?.tenantId ?? null;
};

export const Tenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => getTenantFromContext(context),
);
