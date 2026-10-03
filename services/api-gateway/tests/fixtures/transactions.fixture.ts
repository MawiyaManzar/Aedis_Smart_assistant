import { randomUUID } from 'crypto';

/**
 * Test fixtures representing bank transaction scenarios
 */
export const validTransaction = {
  transactionId: randomUUID(),
  fromAccountId: 'acc_user_101',
  toAccountId: 'acc_mule_888',
  amount: 4999.50,
  currency: 'USD',
  channel: 'mobile' as const,
  deviceId: 'dev_iphone_15_xyz',
  ipAddress: '192.168.1.50',
};

export const highValueTransfer = {
  transactionId: randomUUID(),
  fromAccountId: 'acc_corporate_001',
  toAccountId: 'acc_offshore_999',
  amount: 250000.00,
  currency: 'USD',
  channel: 'web' as const,
  deviceId: 'dev_macbook_corp_01',
  ipAddress: '10.0.0.12',
};

export const invalidTransactions = {
  negativeAmount: {
    ...validTransaction,
    transactionId: randomUUID(),
    amount: -50.00,
  },
  zeroAmount: {
    ...validTransaction,
    transactionId: randomUUID(),
    amount: 0,
  },
  invalidUuid: {
    ...validTransaction,
    transactionId: 'not-a-valid-uuid',
  },
  missingSender: {
    transactionId: randomUUID(),
    toAccountId: 'acc_mule_888',
    amount: 100.00,
    currency: 'USD',
    channel: 'mobile' as const,
  },
  invalidChannel: {
    ...validTransaction,
    transactionId: randomUUID(),
    channel: 'carrier_pigeon',
  },
};
