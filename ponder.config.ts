import { createConfig } from "ponder";
import { erc20Abi, http } from "viem";
import { UniswapV3Pool } from "./abis/UniswapV3Pool";


export default createConfig({
  chains: { mainnet: { id: 1, rpc: http(process.env.PONDER_RPC_URL_1)},  },
  contracts: {
    FrogeToken: {
      abi: erc20Abi,
      address: "0xcab254f1a32343f11ab41fbde90ecb410cde348a",
      chain: "mainnet",
      startBlock: 21086355,
      
    },
    UniswapV3Pool: {
      abi: UniswapV3Pool,
      address: "0x5628F3bb1f352f86Ea173184ffEe2E34b8fc2dc8",
      chain: "mainnet",
      startBlock: 21086355,
    },
  },
});
