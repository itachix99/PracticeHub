import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAttemptSnapshot,
  saveAttemptAnswers,
} from "@/lib/services/attempt.service";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().cuid(),
        selectedOptionId: z.string().cuid().nullable(),
        state: z.enum([
          "NOT_VISITED",
          "NOT_ANSWERED",
          "ANSWERED",
          "MARKED",
          "ANSWERED_MARKED",
        ]),
        timeSpentMs: z
          .number()
          .int()
          .min(0)
          .max(24 * 60 * 60 * 1000)
          .optional(),
      })
    )
    .max(500),
});

export async function GET(
  _req: Request,
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
  return NextResponse.json({ attempt });
}

export async function PATCH(
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  // Validate questionIds belong to version
  const validIds = new Set<string>();
  const version = await prisma.examVersion.findUnique({
    where: { id: attempt.versionId },
    include: { sections: { include: { questions: { select: { id: true } } } } },
  });
  if (version) {
    for (const s of version.sections)
      for (const q of s.questions) validIds.add(q.id);
  }
  for (const a of parsed.data.answers) {
    if (!validIds.has(a.questionId))
      return NextResponse.json(
        { error: `Question ${a.questionId} not in this exam version` },
        { status: 400 }
      );
    if (a.selectedOptionId) {
      const opt = await prisma.questionOption.findUnique({
        where: { id: a.selectedOptionId },
      });
      if (!opt || opt.questionId !== a.questionId)
        return NextResponse.json(
          {
            error: `Option ${a.selectedOptionId} does not belong to question ${a.questionId}`,
          },
          { status: 400 }
        );
    }
  }
  try {
    await saveAttemptAnswers(id, parsed.data.answers as never);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (msg.includes("expired"))
      return NextResponse.json({ error: "Attempt expired" }, { status: 410 });
    if (msg.includes("not in progress"))
      return NextResponse.json({ error: msg }, { status: 409 });
    console.error("[saveAttempt]", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
