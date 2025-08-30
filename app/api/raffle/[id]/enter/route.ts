import type { NextRequest } from "next/server"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    console.log("[v0] Backend received:", {
      raffleId: params.id,
      qrId: body?.qrId,
      txHash: body?.txHash,
      userAddress: body?.userAddress,
      chain: body?.chain,
    })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    console.error("[v0] Backend error:", e)
    return new Response(e?.message || "Internal error", { status: 500 })
  }
}
