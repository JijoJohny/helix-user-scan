"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { QRScanner } from "@/components/qr-scanner"
import { connectWalletAndEnsureChain, getEvmProvider, getUserAddress } from "@/lib/evm"
import { getRaffleContract, type SupportedChain } from "@/lib/raffle-contract"

type ParsedScan = { raffleId: string; qrId?: string; valueWei?: string } | null

function parseScannedData(raw: string): ParsedScan {
  try {
    const json = JSON.parse(raw)
    if (json && json.raffleId) {
      return {
        raffleId: String(json.raffleId),
        qrId: json.qrId ? String(json.qrId) : undefined,
        valueWei: json.valueWei ? String(json.valueWei) : undefined,
      }
    }
  } catch {
    try {
      const url = new URL(raw)
      const raffleId = url.searchParams.get("raffleId") || url.searchParams.get("raffle_id")
      const qrId = url.searchParams.get("qrId") || url.searchParams.get("qr_id") || undefined
      const valueWei = url.searchParams.get("valueWei") || url.searchParams.get("value_wei") || undefined
      if (raffleId) {
        return { raffleId: String(raffleId), qrId: qrId ?? undefined, valueWei: valueWei ?? undefined }
      }
    } catch {}
  }
  return null
}

export default function ScanPage() {
  const [scannedRaw, setScannedRaw] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedScan>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [chain, setChain] = useState<SupportedChain>("fuji")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [manualRaw, setManualRaw] = useState<string>("")
  const [isIframe, setIsIframe] = useState(false)

  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top)
    } catch {
      setIsIframe(true)
    }
  }, [])

  const onScan = useCallback((text: string) => {
    setScannedRaw(text)
    const p = parseScannedData(text)
    setParsed(p)
    setTxHash(null)
    setError(null)
    setScanError(null)
  }, [])

  const canSubmit = useMemo(() => Boolean(parsed?.raffleId && walletAddress), [parsed?.raffleId, walletAddress])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    setError(null)
    try {
      const { chainUsed } = await connectWalletAndEnsureChain(chain)
      setChain(chainUsed)
      const addr = await getUserAddress()
      setWalletAddress(addr)
    } catch (e: any) {
      console.error("[v0] Connect error:", e)
      setError(e?.message || "Failed to connect wallet")
    } finally {
      setIsConnecting(false)
    }
  }, [chain])

  const handleEnterRaffle = useCallback(async () => {
    if (!parsed?.raffleId) return
    setIsSubmitting(true)
    setError(null)
    setTxHash(null)
    try {
      const provider = getEvmProvider()
      const signer = await provider.getSigner()
      const contract = getRaffleContract({ signer, chain })
      const overrides: Record<string, any> = {}
      if (parsed.valueWei) overrides.value = parsed.valueWei

      console.log("[v0] Sending tx with overrides:", overrides)
      const tx = await contract.enterRaffle(parsed.raffleId, overrides)
      const receipt = await tx.wait()
      console.log("[v0] Tx mined:", receipt.hash)
      setTxHash(receipt.hash)

      const res = await fetch(`/api/raffle/${parsed.raffleId}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrId: parsed.qrId || null,
          txHash: receipt.hash,
          userAddress: await signer.getAddress(),
          chain,
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Backend error: ${t || res.status}`)
      }
    } catch (e: any) {
      console.error("[v0] Enter raffle error:", e)
      setError(e?.message || "Failed to submit transaction")
    } finally {
      setIsSubmitting(false)
    }
  }, [chain, parsed])

  return (
    <main className="mx-auto max-w-xl p-6 flex flex-col gap-6">
      {isIframe && (
        <div className="rounded-md border bg-amber-100/60 p-3 text-sm text-amber-900">
          Camera access may be blocked in this preview. Try opening the scanner in a new tab.
          <button
            type="button"
            onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}
            className="ml-2 inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium hover:bg-amber-200"
          >
            Open in new tab
          </button>
        </div>
      )}

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-pretty">AVAX QR Raffle</h1>
        <p className="text-sm text-muted-foreground">
          1) Scan the QR or enter manually. 2) Connect your wallet. 3) Enter the raffle on Avalanche.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">1) Scan QR or Enter Manually</h2>
        <QRScanner
          onScanned={onScan}
          onError={(err) => {
            const msg =
              typeof err === "string"
                ? err
                : err?.name === "NotAllowedError"
                  ? "Camera permission was denied or dismissed. Please allow access and try again."
                  : err?.message || "Camera error"
            setScanError(msg)
          }}
        />
        {scanError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {scanError} If blocked previously, re-enable camera permission in your browser settings and click Start
            camera again.
          </div>
        )}
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium mb-1">Scanned data</div>
          {scannedRaw ? (
            <div className="break-all">{scannedRaw}</div>
          ) : (
            <div className="text-muted-foreground">Nothing scanned yet</div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Manual entry (optional)</div>
          <input
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Paste QR content or URL here (e.g., https://.../?raffleId=123&qrId=abc)"
            value={manualRaw}
            onChange={(e) => setManualRaw(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                if (!manualRaw.trim()) return
                onScan(manualRaw.trim())
              }}
            >
              Use this code
            </Button>
            <div className="text-xs text-muted-foreground">
              Tip: Works with JSON {"{ raffleId, qrId, valueWei }"} or a URL with search params.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">raffleId</div>
            <div className="font-medium">{parsed?.raffleId || "-"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">qrId</div>
            <div className="font-medium">{parsed?.qrId || "-"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">valueWei</div>
            <div className="font-medium">{parsed?.valueWei || "-"}</div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">2) Connect Wallet (Avalanche)</h2>
        <div className="flex items-center gap-3">
          <Button onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? "Connecting…" : walletAddress ? "Connected" : "Connect Wallet"}
          </Button>
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={chain}
            onChange={(e) => setChain(e.target.value as SupportedChain)}
          >
            <option value="fuji">Avalanche Fuji (Testnet)</option>
            <option value="avalanche">Avalanche C-Chain (Mainnet)</option>
          </select>
        </div>
        <div className="text-sm">
          Address: <span className="font-medium">{walletAddress ? walletAddress : "—"}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">3) Enter Raffle</h2>
        <Button onClick={handleEnterRaffle} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Submitting…" : "Enter Raffle"}
        </Button>

        {txHash && (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Transaction submitted</div>
            <div className="break-all">{txHash}</div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>
    </main>
  )
}
