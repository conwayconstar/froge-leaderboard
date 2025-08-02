import { createConfig } from "ponder";

import { UnverifiedContractAbi } from "./abis/UnverifiedContractAbi";

export default createConfig({
  chains: { mainnet: { id: 1, rpc: "http(process.env.PONDER_RPC_URL_1)" } },
  contracts: {
    UnverifiedContract: {
      abi: UnverifiedContractAbi,
      address: "0xcab254f1a32343f11ab41fbde90ecb410cde348a",
      chain: "mainnet",
    },
  },
});
