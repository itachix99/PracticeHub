import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAttemptSnapshot,
  submitAttempt,
} from "@/lib/services/attempt.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id ?? null;
  const attempt = await getAttemptSnapshot(id);
  if (!attempt)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.userId && attempt.userId !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;
  try {
    const { result, alreadySubmitted } = await submitAttempt(
      id,
      idempotencyKey
    );
    return NextResponse.json(
      { result, alreadySubmitted },
      { status: alreadySubmitted ? 200 : 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (msg.includes("Cannot submit"))
      return NextResponse.json({ error: msg }, { status: 409 });
    if (msg.includes("not found"))
      return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[submitAttempt]", e);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
