import { ponder } from "ponder:registry";
import { transfer } from "../ponder.schema";

ponder.on("FrogeToken:Transfer", async ({ event, context }) => {
	await context.db.insert(transfer).values({
		id: `0x${event.id}`,
		from: event.args.from,
		to: event.args.to,
		value: event.args.value,
		blockNumber: event.block.number,
		timestamp: event.block.timestamp,
		logIndex: event.log.logIndex,
		txHash: event.transaction.hash,
	});
});
