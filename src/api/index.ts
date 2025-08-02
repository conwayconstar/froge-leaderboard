import { db } from "ponder:api";
import { swap, transfer } from "ponder:schema";
import { Hono } from "hono";

const app = new Hono();

// Constants
const DEPLOYER_ADDRESS = "0x34919f7dd781e5cdbda923392dbc627add997a8f";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Scoring weights and multipliers
const SCORING = {
	BALANCE_WEIGHT: 40,
	TIME_WEIGHTED_WEIGHT: 40,
	SOLD_PENALTY_WEIGHT: 20,
	DIAMOND_HANDS_BONUS: 1.1,
	OG_BONUS: 1.15,
	PAPER_HANDS_PENALTY: 0.5,
	DUMP_PENALTIES: {
		MAJOR: 0.6,    // 90%+ from peak
		SIGNIFICANT: 0.8, // 75%+ from peak
		MODERATE: 0.9,    // 50%+ from peak
	}
};

// Helper function to calculate log10 for bigints
function log10BigInt(value: bigint): number {
	if (value <= 0n) return 0;
	const str = value.toString();
	return Math.log10(Number(str.slice(0, 15) + "e" + (str.length - 15)));
}

// Helper function to create initial holder metrics
function createInitialHolderMetrics() {
	return {
		balance: 0n,
		totalReceived: 0n,
		totalSent: 0n,
		totalSold: 0n,
		totalProfitEth: 0n,
		timeWeightedBalance: 0n,
		hasBought: false,
		isOG: false,
		historicalHighBalance: 0n,
		balanceHistory: [] as Array<{ timestamp: number; balance: bigint }>,
	};
}

interface HolderMetrics {
	balance: bigint;
	totalReceived: bigint;
	totalSent: bigint;
	totalSold: bigint;
	totalProfitEth: bigint;
	timeWeightedBalance: bigint;
	hasBought: boolean;
	isOG: boolean;
	historicalHighBalance: bigint;
	balanceHistory: Array<{ timestamp: number; balance: bigint }>;
}

interface HolderData {
	address: string;
	balance: string;
	totalReceived: string;
	totalSent: string;
	totalSold: string;
	totalProfitEth: string;
	timeWeightedBalance: string;
	historicalHighBalance: string;
	score: number;
	isDiamondHands: boolean;
	isPaperHands: boolean;
	isOG: boolean;
}

// Process transfers and update holder metrics
function processTransfers(transfers: any[], holderMetrics: Map<string, HolderMetrics>) {
	for (const transfer of transfers) {
		const { from, to, value, timestamp } = transfer;

		// Handle recipient
		if (to !== ZERO_ADDRESS) {
			if (!holderMetrics.has(to)) {
				holderMetrics.set(to, createInitialHolderMetrics());
			}
			const holder = holderMetrics.get(to)!;
			holder.balance += value;
			holder.totalReceived += value;

			// Update historical high balance
			if (holder.balance > holder.historicalHighBalance) {
				holder.historicalHighBalance = holder.balance;
			}

			// Check if this is from deployer (OG status)
			if (from === DEPLOYER_ADDRESS || from.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase()) {
				holder.hasBought = true;
				holder.isOG = true;
			}

			holder.balanceHistory.push({
				timestamp: Number(timestamp),
				balance: holder.balance,
			});
		}

		// Handle sender
		if (from !== ZERO_ADDRESS) {
			if (!holderMetrics.has(from)) {
				holderMetrics.set(from, createInitialHolderMetrics());
			}
			const holder = holderMetrics.get(from)!;
			holder.balance -= value;
			holder.totalSent += value;

			holder.balanceHistory.push({
				timestamp: Number(timestamp),
				balance: holder.balance,
			});
		}
	}
}

// Process swaps and update holder metrics
function processSwaps(swaps: any[], holderMetrics: Map<string, HolderMetrics>) {
	for (const swap of swaps) {
		const { sender, recipient, amount0, amount1, effectivePrice } = swap;

		// Handle swap selling (positive amount0 = selling our token)
		if (amount0 > 0n) {
			if (!holderMetrics.has(sender)) {
				holderMetrics.set(sender, createInitialHolderMetrics());
			}
			const holder = holderMetrics.get(sender)!;
			holder.totalSold += amount0;

			// Only calculate profit if they have actually bought tokens
			if (holder.hasBought) {
				const amt1 = BigInt(amount1);
				const price = BigInt(effectivePrice);
				holder.totalProfitEth +=
					((amt1 < 0n ? -amt1 : amt1) * price) / (10n ** 18n);
			}
		}

		// Handle swap buying (negative amount0 = buying our token)
		if (amount0 < 0n) {
			if (!holderMetrics.has(recipient)) {
				holderMetrics.set(recipient, createInitialHolderMetrics());
			}
			const holder = holderMetrics.get(recipient)!;

			// Mark as having bought via swap
			holder.hasBought = true;

			// Calculate the cost of buying (negative profit initially)
			const amt1 = BigInt(amount1);
			const price = BigInt(effectivePrice);
			holder.totalProfitEth -=
				((amt1 > 0n ? amt1 : -amt1) * price) / (10n ** 18n);
		}
	}
}

// Calculate time-weighted balances for all holders
function calculateTimeWeightedBalances(holderMetrics: Map<string, HolderMetrics>) {
	for (const [address, holder] of holderMetrics) {
		holder.balanceHistory.sort((a, b) => a.timestamp - b.timestamp);
		let timeWeighted = 0n;

		for (let i = 0; i < holder.balanceHistory.length - 1; i++) {
			const current = holder.balanceHistory[i];
			const next = holder.balanceHistory[i + 1];
			if (current && next) {
				const duration = BigInt(next.timestamp - current.timestamp);
				timeWeighted += current.balance * duration;
			}
		}

		// Add current balance weighted by time since last change
		if (holder.balanceHistory.length > 0) {
			const last = holder.balanceHistory[holder.balanceHistory.length - 1];
			if (last) {
				const currentTime = Math.floor(Date.now() / 1000);
				const duration = BigInt(currentTime - last.timestamp);
				timeWeighted += last.balance * duration;
			}
		}

		holder.timeWeightedBalance = timeWeighted;
	}
}

// Calculate score for a holder
function calculateScore(
	balance: bigint,
	timeWeightedBalance: bigint,
	totalSold: bigint,
	historicalHighBalance: bigint,
	isOG: boolean
): number {
	// Calculate base score
	let score =
		log10BigInt(balance + 1n) * SCORING.BALANCE_WEIGHT +
		log10BigInt(timeWeightedBalance + 1n) * SCORING.TIME_WEIGHTED_WEIGHT -
		log10BigInt(totalSold + 1n) * SCORING.SOLD_PENALTY_WEIGHT;

	// Apply bonuses and penalties
	if (balance === 0n && totalSold > 0n) {
		score *= SCORING.PAPER_HANDS_PENALTY; // Paper hands penalty
	}
	if (totalSold === 0n) {
		score *= SCORING.DIAMOND_HANDS_BONUS; // Diamond hands bonus
	}
	if (isOG) {
		score *= SCORING.OG_BONUS; // OG bonus
	}

	// Consistency penalty based on dump from peak
	if (historicalHighBalance > 0n) {
		const currentRatio = Number((balance * 1000n) / historicalHighBalance) / 1000;
		if (currentRatio < 0.1) {
			score *= SCORING.DUMP_PENALTIES.MAJOR;
		} else if (currentRatio < 0.25) {
			score *= SCORING.DUMP_PENALTIES.SIGNIFICANT;
		} else if (currentRatio < 0.5) {
			score *= SCORING.DUMP_PENALTIES.MODERATE;
		}
	}

	return Math.round(score * 100) / 100;
}

app.get("/leaderboard", async (c) => {
	try {
		// Fetch all transfers and swaps from the database
		const [transfers, swaps] = await Promise.all([
			db.select().from(transfer),
			db.select().from(swap),
		]);

		// Calculate holder metrics
		const holderMetrics = new Map<string, HolderMetrics>();
		
		processTransfers(transfers, holderMetrics);
		processSwaps(swaps, holderMetrics);
		calculateTimeWeightedBalances(holderMetrics);

		// Convert to leaderboard format
		const leaderboard: HolderData[] = Array.from(holderMetrics.entries())
			.filter(([_, metrics]) => 
				metrics.balance > 0n || metrics.totalReceived > 0n || metrics.totalSent > 0n
			)
			.map(([address, metrics]) => {
				const score = calculateScore(
					metrics.balance,
					metrics.timeWeightedBalance,
					metrics.totalSold,
					metrics.historicalHighBalance,
					metrics.isOG
				);

				// Determine status flags
				const isDiamondHands = metrics.totalSold === 0n;
				const isPaperHands = metrics.balance === 0n && metrics.totalSold > 0n;

				return {
					address,
					balance: metrics.balance.toString(),
					totalReceived: metrics.totalReceived.toString(),
					totalSent: metrics.totalSent.toString(),
					totalSold: metrics.totalSold.toString(),
					totalProfitEth: metrics.totalProfitEth.toString(),
					timeWeightedBalance: metrics.timeWeightedBalance.toString(),
					historicalHighBalance: metrics.historicalHighBalance.toString(),
					score,
					isDiamondHands,
					isPaperHands,
					isOG: metrics.isOG,
				};
			})
			.sort((a, b) => b.score - a.score);

		return c.json(leaderboard);
	} catch (error) {
		console.error("Error fetching leaderboard:", error);
		return c.json({ error: "Failed to fetch leaderboard" }, 500);
	}
});

app.get("/", (c) => {
	return c.json({
		message: "Froge Leaderboard API",
		endpoints: {
			"/leaderboard": "Get holder leaderboard with scores calculated from transfer and swap data",
		},
		scoring: {
			formula: `log10(balance + 1) * ${SCORING.BALANCE_WEIGHT} + log10(timeWeightedBalance + 1) * ${SCORING.TIME_WEIGHTED_WEIGHT} - log10(totalSold + 1) * ${SCORING.SOLD_PENALTY_WEIGHT}`,
			bonuses: {
				"Diamond hands (never sold)": `${SCORING.DIAMOND_HANDS_BONUS}x`,
				"OG (received from deployer)": `${SCORING.OG_BONUS}x`,
			},
			penalties: {
				"Sold everything": `${SCORING.PAPER_HANDS_PENALTY}x`,
				"Major dump (90%+ from peak)": `${SCORING.DUMP_PENALTIES.MAJOR}x`,
				"Significant dump (75%+ from peak)": `${SCORING.DUMP_PENALTIES.SIGNIFICANT}x`,
				"Moderate dump (50%+ from peak)": `${SCORING.DUMP_PENALTIES.MODERATE}x`,
			},
		},
		statusFlags: {
			isDiamondHands: "Never sold any tokens (totalSold = 0)",
			isPaperHands: "Sold everything (balance = 0 and totalSold > 0)",
			isOG: "Received tokens directly from deployer",
		},
		config: {
			deployerAddress: DEPLOYER_ADDRESS,
		},
	});
});

export default app;
