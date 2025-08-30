"use client"

import { useCallback } from "react"
import { Scanner } from "@yudiel/react-qr-scanner"

export function QRScanner({ onScanned }: { onScanned: (text: string) => void }) {
  const handleResult = useCallback(
    (text: string | null) => {
      if (text) onScanned(text)
    },
    [onScanned],
  )

  const handleError = useCallback((err: any) => {
    console.log("[v0] QR scanner error:", err)
  }, [])

  return (
    <div className="rounded-md border p-2">
      <div className="overflow-hidden rounded-md">
        <Scanner onResult={handleResult} onError={handleError} constraints={{ facingMode: "environment" }} />
      </div>
      <div className="p-2 text-xs text-muted-foreground">Grant camera permission to scan QR codes.</div>
    </div>
  )
}
