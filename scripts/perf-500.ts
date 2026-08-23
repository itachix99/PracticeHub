import { prisma } from "../lib/db";

async function main() {
  const slug = "perf-500q-test";
  console.log("[perf] starting 500q benchmark...");

  const existing = await prisma.exam.findUnique({ where: { slug }, include: { versions: { include: { sections: true } } } });
  if (existing) {
    console.log("[perf] cleaning previous", slug);
    for (const v of existing.versions) {
      await prisma.question.deleteMany({ where: { sectionId: { in: v.sections.map(s => s.id) } } });
      await prisma.examSection.deleteMany({ where: { versionId: v.id } });
      await prisma.examAttempt.deleteMany({ where: { versionId: v.id } });
      await prisma.examVersion.deleteMany({ where: { id: v.id } });
    }
    await prisma.exam.delete({ where: { id: existing.id } });
  }

  const admin = await prisma.user.findUnique({ where: { email: "admin@practicehub.local" } });
  if (!admin) throw new Error("admin not found, run seed first");

  const startCreate = performance.now();
  const exam = await prisma.exam.create({
    data: {
      slug,
      title: "Perf Test 500Q",
      ownerId: admin.id,
      visibility: "PRIVATE",
      isPublished: true,
    },
  });

  const config = JSON.stringify({
    timing: { totalSec: 10800, warningSec: 600, sectionTimers: false },
    marking: { perSection: false, default: { marks: 1, negative: 0.25 }, bonusAllowed: false },
    navigation: { mode: "free" as const },
  });

  const version = await prisma.examVersion.create({
    data: {
      examId: exam.id,
      version: 1,
      config,
    },
  });
  await prisma.exam.update({ where: { id: exam.id }, data: { currentVersionId: version.id } });

  const sections: { id: string; name: string }[] = [];
  for (let s = 0; s < 5; s++) {
    const sec = await prisma.examSection.create({
      data: {
        versionId: version.id,
        name: s === 0 ? "Section A" : s === 1 ? "Section B" : s === 2 ? "Section C" : s === 3 ? "Section D" : "Section E",
        order: s,
      },
    });
    sections.push({ id: sec.id, name: sec.name });
  }

  const batchSize = 50;
  let created = 0;
  for (let batch = 0; batch < 10; batch++) {
    const batchStart = performance.now();
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batchSize; i++) {
        const idx = batch * batchSize + i;
        const secIdx = Math.floor(idx / 100);
        const sectionId = sections[secIdx]!.id;
        const q = await tx.question.create({
          data: {
            sectionId,
            order: idx % 100,
            text: `Q${idx + 1}. What is ${idx} + ${idx}? Choose the correct answer.`,
            marks: 1,
            negativeMarks: 0.25,
            type: "SCQ",
          },
        });
        const options = ["A", "B", "C", "D"];
        for (let o = 0; o < 4; o++) {
          await tx.questionOption.create({
            data: {
              questionId: q.id,
              label: options[o]!,
              order: o,
              text: `Option ${options[o]} for Q${idx + 1}`,
              isCorrect: o === 0,
            },
          });
        }
        await tx.answer.create({
          data: {
            questionId: q.id,
            correctOptionId: (await tx.questionOption.findFirst({ where: { questionId: q.id, label: "A" } }))!.id,
          },
        });
        created++;
      }
    });
    const batchElapsed = performance.now() - batchStart;
    console.log(`[perf] batch ${batch + 1}/10  ${batchElapsed.toFixed(0)}ms  (${created} created)`);
  }

  const createElapsed = performance.now() - startCreate;
  console.log(`[perf] created exam ${exam.slug} with ${created} questions in ${createElapsed.toFixed(0)}ms`);

  const fetchStart = performance.now();
  const fetched = await prisma.exam.findUnique({
    where: { slug },
    include: {
      currentVersion: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: {
              questions: {
                orderBy: { order: "asc" },
                include: { options: { orderBy: { order: "asc" } }, answer: true },
              },
            },
          },
        },
      },
    },
  });
  const fetchElapsed = performance.now() - fetchStart;
  const qCount = fetched?.currentVersion?.sections.reduce((a, s) => a + s.questions.length, 0) ?? 0;
  console.log(`[perf] fetch exam with sections+questions: ${fetchElapsed.toFixed(2)}ms  (${qCount} questions)`);

  const pagStart = performance.now();
  const _paginated = await prisma.question.findMany({
    where: { sectionId: sections[0]!.id },
    orderBy: { order: "asc" },
    take: 50,
    include: { options: true },
  });
  void _paginated;
  const pagElapsed = performance.now() - pagStart;
  console.log(`[perf] pagination fetch 50/100: ${pagElapsed.toFixed(2)}ms`);

  const reportStart = performance.now();
  await prisma.report.findMany({ where: { status: "OPEN" }, take: 20, orderBy: { createdAt: "desc" } });
  const reportElapsed = performance.now() - reportStart;
  console.log(`[perf] report query (status OPEN): ${reportElapsed.toFixed(2)}ms`);

  const attemptStart = performance.now();
  await prisma.examAttempt.findMany({ where: { examId: exam.id }, take: 20 });
  const attemptElapsed = performance.now() - attemptStart;
  console.log(`[perf] attempt query (examId): ${attemptElapsed.toFixed(2)}ms`);

  const total = fetchElapsed + pagElapsed + reportElapsed + attemptElapsed;
  console.log(`[perf] total query time: ${total.toFixed(2)}ms`);

  if (fetchElapsed > 2000) {
    console.error(`[perf] FAIL fetch >2000ms`);
    process.exit(1);
  }
  if (qCount !== 500) {
    console.error(`[perf] FAIL qCount ${qCount} !== 500`);
    process.exit(1);
  }
  console.log("[perf] PASS 500Q benchmark");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
