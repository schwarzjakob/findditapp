import "server-only";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ensureIdeas, resolveWindowKey } from "@/lib/ideas/service";
import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowParam = searchParams.get("window") ?? "30d";
  const { days } = resolveWindowKey(windowParam);

  logger.info({ days }, "ADMIN_INGEST_REQUEST");

  try {
    const summary = await ensureIdeas({
      windowDays: days,
      force: true,
      subreddits: DEFAULT_SUBREDDITS
    });

    return NextResponse.json({
      ok: true,
      windowDays: days,
      summary
    });
  } catch (error) {
    logger.error({ stage: "admin_ingest", error: error instanceof Error ? error.message : String(error) }, "INGEST_FAILED");
    return NextResponse.json(
      { error: "Ingest failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
