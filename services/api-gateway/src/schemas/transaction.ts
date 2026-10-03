import { z } from 'zod';

export const TransactionSchema = z.object({
  transactionId: z.uuid(),
  fromAccountId: z.string().min(1, 'Sender account is required'),
  toAccountId: z.string().min(1, 'Receiver account is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().length(3).default('USD'),
  channel: z.enum(['mobile', 'web', 'atm', 'branch']),
  deviceId: z.string().optional(),
  ipAddress: z.string().optional(),
  timestamp: z.string().datetime().optional().default(() => new Date().toISOString()),
});

export type TransactionInput = z.infer<typeof TransactionSchema>;
