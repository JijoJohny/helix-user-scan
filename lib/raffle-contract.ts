import { ethers } from "ethers"

// Minimal ABI with enterRaffle(uint256) payable/nonpayable
const RAFFLE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "raffleId", type: "uint256" }],
    name: "enterRaffle",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const

// Replace these with your actual deployed contract addresses
const CONTRACT_ADDRESSES = {
  avalanche: "0xYourMainnetContractAddressHere", // 43114
  fuji: "0xYourFujiTestnetContractAddressHere", // 43113
}

export type SupportedChain = keyof typeof CONTRACT_ADDRESSES

export function getRaffleContract({
  signer,
  chain,
}: {
  signer: ethers.Signer
  chain: SupportedChain
}) {
  const address = CONTRACT_ADDRESSES[chain]
  if (!address || address.startsWith("0xYour")) {
    throw new Error(`Set contract address for ${chain} in lib/raffle-contract.ts`)
  }
  return new ethers.Contract(address, RAFFLE_ABI, signer) as unknown as {
    enterRaffle: (raffleId: string | number, overrides?: Record<string, any>) => Promise<any>
  }
}
