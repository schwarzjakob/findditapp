import "server-only";

export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { ensureIdeas, filterIdeas, listIdeas, resolveWindowKey, sortIdeas, toIdeasResponse } from "@/lib/ideas/service";
import type { SortOption } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowParam = searchParams.get("window") ?? undefined;
  const sortParam = (searchParams.get("sort") ?? "top") as SortOption;
  const filterParam = searchParams.get("q") ?? undefined;
  const force = true; // TESTING: Force refresh to bypass cache

  const { days } = resolveWindowKey(windowParam ?? undefined);

  await ensureIdeas({ windowDays: days, force });

  const ideas = listIdeas(days);
  const sorted = sortIdeas(ideas, sortParam);
  const filtered = filterIdeas(sorted, filterParam ?? undefined);
  const payload = toIdeasResponse(filtered, days);

  return NextResponse.json(payload);
}
