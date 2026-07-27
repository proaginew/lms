import { processContentAgentTick } from "@/lib/contentAgent";
import { expectedGraphClientState } from "@/lib/graph";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type GraphNotification = {
  clientState?: string;
  resource?: string;
  changeType?: string;
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    value?: GraphNotification[];
  };
  const expected = expectedGraphClientState();
  const notes = payload.value ?? [];
  const valid = notes.filter((n) => !n.clientState || n.clientState === expected);

  await prisma.syncState.upsert({
    where: { id: "drive" },
    create: { id: "drive", lastWebhookAt: new Date() },
    update: { lastWebhookAt: new Date() },
  });

  // Respond quickly; kick processing asynchronously
  const secret = process.env.CRON_SECRET?.trim();
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (valid.length && secret && base) {
    void fetch(`${base.replace(/\/$/, "")}/api/cron/content-agent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ discover: true }),
    }).catch(() => undefined);
  } else if (valid.length) {
    // Local/dev fallback: process one tick inline (best effort)
    void processContentAgentTick({ discover: true }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ ok: true });
}
