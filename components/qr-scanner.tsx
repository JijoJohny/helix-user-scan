"use client"

import { useCallback, useState } from "react"
import { Scanner } from "@yudiel/react-qr-scanner"
import { BrowserQRCodeReader } from "@zxing/browser"

type QRScannerProps = {
  onScanned: (text: string) => void
  onError?: (err: any) => void
}

export function QRScanner({ onScanned, onError }: QRScannerProps) {
  const [started, setStarted] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [isDecoding, setIsDecoding] = useState(false)

  const handleResult = useCallback(
    (text: string | null) => {
      if (text) {
        setErrMsg(null)
        onScanned(text)
      }
    },
    [onScanned],
  )

  const humanizeError = (err: any) => {
    const name = err?.name || ""
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera permission was denied or blocked. Please allow camera access in your browser settings and try again."
    }
    if (name === "NotFoundError") {
      return "No camera found on this device."
    }
    return err?.message || "Unable to start the camera."
  }

  const handleError = useCallback(
    (err: any) => {
      console.log("[v0] QR scanner error:", err)
      const msg = humanizeError(err)
      setErrMsg(msg)
      // Stop the scanner so user can retry
      setStarted(false)
      onError?.(err)
    },
    [onError],
  )

  const handleUpload = useCallback(
    async (file: File) => {
      setIsDecoding(true)
      setErrMsg(null)
      try {
        const url = URL.createObjectURL(file)
        const reader = new BrowserQRCodeReader()
        const result = await reader.decodeFromImageUrl(url)
        URL.revokeObjectURL(url)
        if (result?.getText()) {
          onScanned(result.getText())
        } else {
          setErrMsg("No QR code detected in the image.")
        }
      } catch (e: any) {
        console.log("[v0] Image decode error:", e)
        setErrMsg(e?.message || "Failed to decode QR from image.")
        onError?.(e)
      } finally {
        setIsDecoding(false)
      }
    },
    [onScanned, onError],
  )

  return (
    <div className="rounded-md border p-2">
      {!started ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            Camera access is required to scan a QR code. Click the button below to start the camera or upload an image.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setErrMsg(null)
                setStarted(true)
              }}
              className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Start camera
            </button>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleUpload(f)
                }}
              />
              {isDecoding ? "Decoding…" : "Upload QR image"}
            </label>
          </div>
          {errMsg && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {errMsg} If you previously denied, re-enable camera in site settings and retry. On iOS Safari, ensure
              you’re on HTTPS and not in a restricted iframe.
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Note: Some browsers block camera in previews/iframes. If scanning doesn’t start, try “Open in new tab” or
            use the “Upload QR image” fallback.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-md">
            <Scanner onResult={handleResult} onError={handleError} constraints={{ facingMode: "environment" }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStarted(false)}
              className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Stop camera
            </button>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleUpload(f)
                }}
              />
              {isDecoding ? "Decoding…" : "Upload QR image"}
            </label>
          </div>
          <div className="text-xs text-muted-foreground">Grant camera permission to scan QR codes.</div>
          {errMsg && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {errMsg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
