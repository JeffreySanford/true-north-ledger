import { z } from 'zod';
import { AuditMetadataSchema } from '@true-north-ledger/ledger-contracts';

export { AuditMetadataSchema };
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;
