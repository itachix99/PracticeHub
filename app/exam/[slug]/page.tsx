import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ExamSimulator } from "@/components/exam/exam-simulator";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await prisma.exam.findUnique({ where: { slug } });
  if (!exam) return { title: "Exam not found" };
  return { title: `${exam.title} — Exam` };
}

export default async function ExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await prisma.exam.findUnique({
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
  if (!exam || !exam.currentVersion) return notFound();
  let config: { timing: { totalSec: number; warningSec?: number }; marking?: { default: { marks: number; negative: number } } };
  try {
    config = JSON.parse(exam.currentVersion.config);
  } catch {
    config = { timing: { totalSec: 3600 } };
  }
  let instructions: string | undefined;
  try {
    instructions = exam.currentVersion.instructions ? JSON.parse(exam.currentVersion.instructions).text : undefined;
  } catch {
    instructions = exam.currentVersion.instructions ?? undefined;
  }
  const examData = {
    examId: exam.id,
    versionId: exam.currentVersion.id,
    slug,
    title: exam.title,
    config: config as never,
    instructions,
    sections: exam.currentVersion.sections.map((sec) => ({
      id: sec.id,
      name: sec.name,
      order: sec.order,
      questions: sec.questions.map((q) => ({
        id: q.id,
        text: q.text,
        order: q.order,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        isBonus: q.isBonus,
        isCancelled: q.isCancelled,
        sectionId: sec.id,
        correctOptionId: q.answer?.correctOptionId ?? null,
        options: q.options.map((o) => ({ id: o.id, label: o.label, text: o.text, order: o.order, isCorrect: o.isCorrect })),
      })),
    })),
  };
  return <ExamSimulator exam={examData} />;
}
