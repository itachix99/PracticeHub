import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  publishUpload,
  publishInputSchema,
} from "@/lib/services/publish.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = publishInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const result = await publishUpload({
      paperUploadId: id,
      ownerId: userId,
      input: parsed.data,
    });
    if ((result as { alreadyPublished?: boolean }).alreadyPublished) {
      return NextResponse.json({
        ok: true,
        alreadyPublished: true,
        exam: result.exam,
      });
    }
    return NextResponse.json({
      ok: true,
      exam: result.exam,
      version: result.version,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("not found")
        ? 404
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
