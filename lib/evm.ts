// Utilities for EVM wallet connection and Avalanche chain handling

import { ethers } from "ethers"

type AddChainParams = {
  chainId: string
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls?: string[]
}

const AVALANCHE_MAINNET: AddChainParams = {
  chainId: "0xa86a", // 43114
  chainName: "Avalanche C-Chain",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
  blockExplorerUrls: ["https://snowtrace.io"],
}

const AVALANCHE_FUJI: AddChainParams = {
  chainId: "0xa869", // 43113
  chainName: "Avalanche Fuji Testnet",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
  blockExplorerUrls: ["https://testnet.snowtrace.io"],
}

export function getEvmProvider() {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No wallet found. Please install MetaMask or a compatible wallet.")
  }
  return new ethers.BrowserProvider((window as any).ethereum)
}

export async function getUserAddress() {
  const provider = getEvmProvider()
  const signer = await provider.getSigner()
  return signer.getAddress()
}

async function switchOrAddChain(target: AddChainParams) {
  const ethereum = (window as any).ethereum
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainId }],
    })
  } catch (switchError: any) {
    // 4902: Unrecognized chain
    if (switchError?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [target],
      })
    } else {
      throw switchError
    }
  }
}

export async function connectWalletAndEnsureChain(pref: "avalanche" | "fuji" = "fuji") {
  const ethereum = (window as any).ethereum
  if (!ethereum) throw new Error("No wallet found")

  // Request accounts
  await ethereum.request?.({ method: "eth_requestAccounts" })

  // Ensure chain
  const target = pref === "avalanche" ? AVALANCHE_MAINNET : AVALANCHE_FUJI
  await switchOrAddChain(target)

  // Return info
  const provider = new ethers.BrowserProvider(ethereum)
  const network = await provider.getNetwork()
  const chainUsed = network.chainId.toString() === "43114" ? "avalanche" : "fuji"
  return { chainUsed, provider }
}

export type { AddChainParams }
