import { index, onchainTable } from "ponder";

export const transfer = onchainTable("transfer", (t) => ({
  /// Meta
  id: t.hex().primaryKey(),
  txHash: t.hex(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  /// Values
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
}), (table) => ({
  timestampIdx: index().on(table.timestamp),
  fromIdx: index().on(table.from),
  toIdx: index().on(table.to),
  txHashIdx: index().on(table.txHash),
  blockNumberIdx: index().on(table.blockNumber),
  toTimestampIdx: index().on(table.to, table.timestamp),
  fromTimestampIdx: index().on(table.from, table.timestamp),
}));


export const swap = onchainTable("swap", (t) => ({
  /// Meta
  id: t.hex().primaryKey(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  /// Swap data
  sender: t.hex().notNull(),
  recipient: t.hex().notNull(),
  amount0: t.bigint().notNull(),
  amount1: t.bigint().notNull(),
  effectivePrice: t.bigint().notNull(), // token1 per token0 (or vice versa, depending on `isToken0`)
}), (table) => ({
  timestampIdx: index().on(table.timestamp),
  senderIdx: index().on(table.sender),
  recipientIdx: index().on(table.recipient),
  txHashIdx: index().on(table.txHash),
  blockNumberIdx: index().on(table.blockNumber),
  senderTimestampIdx: index().on(table.sender, table.timestamp),
  recipientTimestampIdx: index().on(table.recipient, table.timestamp),
}));