import "server-only";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getIdeaById } from "@/lib/ideas/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = getIdeaById(id);
  
  if (!idea) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  
  return NextResponse.json(idea);
}
