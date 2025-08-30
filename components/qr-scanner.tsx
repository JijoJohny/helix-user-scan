"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import jsQR from "jsqr"
import { BrowserQRCodeReader } from "@zxing/browser"

type QRScannerProps = {
  onScanned: (text: string) => void
  onError?: (err: any) => void
}

type VideoDevice = MediaDeviceInfo & { kind: "videoinput" }

export function QRScanner({ onScanned, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [started, setStarted] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [isDecodingImage, setIsDecodingImage] = useState(false)
  const [devices, setDevices] = useState<VideoDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | "auto">("auto")
  const [isIframe, setIsIframe] = useState(false)

  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top)
    } catch {
      setIsIframe(true)
    }
  }, [])

  const enumerateVideoInputs = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const vids = all.filter((d): d is VideoDevice => d.kind === "videoinput")
      setDevices(vids)
      return vids
    } catch (e) {
      console.log("[v0] enumerateDevices error:", e)
      return []
    }
  }, [])

  const findBackCameraId = useCallback(
    async (vids?: VideoDevice[]) => {
      const list = vids ?? (await enumerateVideoInputs())
      const back = list.find(
        (d) =>
          /back|rear|environment/i.test(d.label) ||
          (/facing back/i.test(d.label) && !/front|true depth|truedepth/i.test(d.label)),
      )
      if (back?.deviceId) return back.deviceId

      if (list.length > 1) return list[list.length - 1]?.deviceId

      return list[0]?.deviceId
    },
    [enumerateVideoInputs],
  )

  const humanizeError = (err: any) => {
    const name = err?.name || ""
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera permission denied or blocked. Allow camera access in your browser settings and try again."
    }
    if (name === "NotFoundError") {
      return "No camera found on this device."
    }
    if (name === "NotReadableError") {
      return "Camera is in use by another application. Close it and retry."
    }
    return err?.message || "Unable to start the camera."
  }

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const decodeLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    const tick = () => {
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const w = video.videoWidth
      const h = video.videoHeight
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h

      ctx.drawImage(video, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" })
      if (code && code.data) {
        console.log("[v0] QR decoded:", code.data)
        try {
          onScanned(code.data)
        } catch (e) {
          console.log("[v0] onScanned handler error:", e)
        }
        setStarted(false)
        stopCamera()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [onScanned, stopCamera])

  const startWithStream = useCallback(
    async (stream: MediaStream) => {
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute("playsinline", "true")
      video.muted = true

      await video.play().catch((e) => {
        console.log("[v0] video.play error:", e)
      })

      setStarted(true)
      decodeLoop()
    },
    [decodeLoop],
  )

  const tryGetUserMedia = useCallback(async (constraints: MediaStreamConstraints) => {
    console.log("[v0] getUserMedia try with constraints:", JSON.stringify(constraints))
    return navigator.mediaDevices.getUserMedia(constraints)
  }, [])

  const startCamera = useCallback(async () => {
    setErrMsg(null)
    try {
      stopCamera()

      try {
        const stream = await tryGetUserMedia({
          video: {
            facingMode: { exact: "environment" as any },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        console.log("[v0] using facingMode exact environment")
        await startWithStream(stream)
        return
      } catch (err: any) {
        console.log("[v0] exact environment failed:", err?.name || err)
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
          throw err
        }
      }

      try {
        const stream = await tryGetUserMedia({
          video: {
            facingMode: { ideal: "environment" as any },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        console.log("[v0] using facingMode ideal environment")
        await startWithStream(stream)
        return
      } catch (err: any) {
        console.log("[v0] ideal environment failed:", err?.name || err)
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
          throw err
        }
      }

      console.log("[v0] preflight getUserMedia(video:true)")
      const preflight = await tryGetUserMedia({ video: true, audio: false })
      for (const t of preflight.getTracks()) t.stop()

      const vids = await enumerateVideoInputs()
      const backId = await findBackCameraId(vids)
      if (!backId) {
        console.log("[v0] no back camera found, fallback to generic camera")
        const stream = await tryGetUserMedia({ video: true, audio: false })
        await startWithStream(stream)
        return
      }

      console.log("[v0] starting with back camera deviceId:", backId)
      setSelectedDeviceId(backId)
      const stream = await tryGetUserMedia({
        video: { deviceId: { exact: backId } },
        audio: false,
      })
      await startWithStream(stream)
      return
    } catch (e: any) {
      console.log("[v0] getUserMedia error:", e)
      const msg = humanizeError(e)
      setErrMsg(msg)
      setStarted(false)
      stopCamera()
      onError?.(e)
    }
  }, [enumerateVideoInputs, findBackCameraId, onError, startWithStream, stopCamera, tryGetUserMedia])

  const handleUpload = useCallback(
    async (file: File) => {
      setIsDecodingImage(true)
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
        setIsDecodingImage(false)
      }
    },
    [onScanned, onError],
  )

  const deviceOptions = useMemo(() => {
    return devices.map((d) => (
      <option key={d.deviceId} value={d.deviceId}>
        {d.label || `Camera ${d.deviceId.slice(0, 6)}…`}
      </option>
    ))
  }, [devices])

  return (
    <div className="rounded-md border p-3">
      {isIframe && (
        <div className="mb-2 rounded-md border bg-amber-100/60 p-2 text-xs text-amber-900">
          Camera may be blocked inside this preview. Click “Open in new tab” or use “Upload QR image”.
        </div>
      )}

      {!started ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            Camera access is required to scan a QR. We’ll try to use the back camera.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void startCamera()
              }}
              className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Start Back Camera
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
              {isDecodingImage ? "Decoding…" : "Upload QR image"}
            </label>
          </div>

          {errMsg && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {errMsg} If previously denied, re-enable camera in site settings and retry. On iOS, ensure HTTPS.
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Tips: Use a well-lit QR, avoid glare, and fill most of the frame. If preview blocks camera, use “Open in new
            tab”.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-md">
            <video ref={videoRef} className="h-64 w-full bg-black object-contain" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStarted(false)
                stopCamera()
              }}
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
              {isDecodingImage ? "Decoding…" : "Upload QR image"}
            </label>
          </div>

          <div className="text-xs text-muted-foreground">
            Grant camera permission when prompted. The scanner will stop automatically after a successful decode.
          </div>

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
