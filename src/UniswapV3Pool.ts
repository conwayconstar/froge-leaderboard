import { ponder } from "ponder:registry";
import { swap } from "../ponder.schema";

ponder.on("UniswapV3Pool:Swap", async ({ event, context }) => {
	const { sqrtPriceX96 } = event.args;

	const sqrtPrice = BigInt(sqrtPriceX96.toString());
	const numerator = sqrtPrice * sqrtPrice * 10n ** 18n;
	const denominator = 2n ** 192n;
	const priceInEth = denominator === 0n ? 0n : numerator / denominator;

	await context.db.insert(swap).values({
		id: `0x${event.id}`,
		sender: event.args.sender,
		recipient: event.args.recipient,
		amount0: event.args.amount0,
		amount1: event.args.amount1,
		effectivePrice: priceInEth,
		blockNumber: event.block.number,
		timestamp: event.block.timestamp,
		logIndex: event.log.logIndex,
		txHash: event.transaction.hash,
	});
});
