import { z } from 'zod';
import { DeviceLedgerEventSchema } from '@true-north-ledger/ledger-contracts';

export { DeviceLedgerEventSchema };
export type DeviceLedgerEvent = z.infer<typeof DeviceLedgerEventSchema>;
