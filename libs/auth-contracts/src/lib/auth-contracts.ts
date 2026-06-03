import { z } from 'zod';
import {
  ActorTypeSchema,
  LedgerPermissionSchema,
} from '@true-north-ledger/ledger-contracts';

export { ActorTypeSchema, LedgerPermissionSchema };
export type ActorType = z.infer<typeof ActorTypeSchema>;
export type LedgerPermission = z.infer<typeof LedgerPermissionSchema>;
