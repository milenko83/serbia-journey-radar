import { NextRequest, NextResponse } from "next/server";
import { collectAll } from "@/lib/collector";

export const runtime = "nodejs";
export const maxDuration = 60;

async function runCollection(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 500 });

  // Vercel Cron invokes GET and supplies Authorization: Bearer <CRON_SECRET>
  // when CRON_SECRET is configured. POST is supported for manual testing too.
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectAll();
    const failed = result.results.some(r => r.status === "failed");
    return NextResponse.json({ ok: !failed, ...result }, { status: failed ? 207 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runCollection(request);
}

export async function POST(request: NextRequest) {
  return runCollection(request);
}
