import { prisma } from "../lib/db";
import { createExamWithVersion } from "../lib/services/exam.service";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "../lib/auth";

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.SEED_ALLOW_PRODUCTION
  ) {
    console.error(
      "[seed] Refusing to seed in production without SEED_ALLOW_PRODUCTION=1"
    );
    process.exit(1);
  }
  console.log("Seeding PracticeHub...");
  const ownerEmail = process.env.SEED_ADMIN_EMAIL || "admin@practicehub.local";
  let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    const hashed = await bcrypt.hash("Admin123!", BCRYPT_ROUNDS);
    owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "PracticeHub Admin",
        password: hashed,
        role: "ADMIN",
      },
    });
    console.log(`Created owner ${owner.email} (${owner.id})`);
  } else {
    console.log(`Owner exists ${owner.email}`);
  }
  const ssc = await prisma.organization.upsert({
    where: { slug: "ssc" },
    update: {},
    create: { name: "SSC", slug: "ssc" },
  });
  const ibps = await prisma.organization.upsert({
    where: { slug: "ibps" },
    update: {},
    create: { name: "IBPS", slug: "ibps" },
  });
  console.log(`Orgs: ${ssc.slug}, ${ibps.slug}`);
  const existing = await prisma.exam.findUnique({
    where: { slug: "ssc-cgl-2024-tier1-mock-1" },
  });
  if (existing) {
    console.log("SSC mock already exists, skipping seed");
    return;
  }
  const sections = [
    {
      name: "General Intelligence and Reasoning",
      order: 0,
      questions: Array.from({ length: 10 }, (_, i) => ({
        text: `Reasoning Q${i + 1}: If A is coded as 1, B as 2... What is the code for WORD? (Sample Q${i + 1})`,
        order: i,
        marks: 2,
        negativeMarks: 0.5,
        explanation: `Explanation for Reasoning Q${i + 1}: Pattern is alphabetical position sum.`,
        options: [
          {
            label: "A",
            text: `Option A for Q${i + 1}`,
            order: 0,
            isCorrect: i % 4 === 0,
          },
          {
            label: "B",
            text: `Option B for Q${i + 1}`,
            order: 1,
            isCorrect: i % 4 === 1,
          },
          {
            label: "C",
            text: `Option C for Q${i + 1}`,
            order: 2,
            isCorrect: i % 4 === 2,
          },
          {
            label: "D",
            text: `Option D for Q${i + 1}`,
            order: 3,
            isCorrect: i % 4 === 3,
          },
        ],
      })),
    },
    {
      name: "Quantitative Aptitude",
      order: 1,
      questions: Array.from({ length: 10 }, (_, i) => ({
        text: `Quant Q${i + 1}: A train travels at 60 km/h... What is the distance? (Sample)`,
        order: i,
        marks: 2,
        negativeMarks: 0.5,
        explanation: `Explanation for Quant Q${i + 1}: Use speed x time.`,
        options: [
          {
            label: "A",
            text: `${100 + i * 10} km`,
            order: 0,
            isCorrect: i % 4 === 0,
          },
          {
            label: "B",
            text: `${120 + i * 10} km`,
            order: 1,
            isCorrect: i % 4 === 1,
          },
          {
            label: "C",
            text: `${140 + i * 10} km`,
            order: 2,
            isCorrect: i % 4 === 2,
          },
          {
            label: "D",
            text: `${160 + i * 10} km`,
            order: 3,
            isCorrect: i % 4 === 3,
          },
        ],
      })),
    },
    {
      name: "English Comprehension",
      order: 2,
      questions: Array.from({ length: 10 }, (_, i) => ({
        text: `English Q${i + 1}: Choose the synonym of "Abundant" (Sample)`,
        order: i,
        marks: 2,
        negativeMarks: 0.5,
        explanation: `Explanation for English Q${i + 1}: Abundant means plentiful.`,
        options: [
          { label: "A", text: "Scarce", order: 0, isCorrect: false },
          { label: "B", text: "Plentiful", order: 1, isCorrect: true },
          { label: "C", text: "Rare", order: 2, isCorrect: false },
          { label: "D", text: "Limited", order: 3, isCorrect: false },
        ],
      })),
    },
  ];
  const { exam, version } = await createExamWithVersion({
    slug: "ssc-cgl-2024-tier1-mock-1",
    title: "SSC CGL 2024 Tier-1 — Mock 1 (30 Questions)",
    organizationId: ssc.id,
    ownerId: owner.id,
    instructions:
      "This is a 30-question mock with 60 minutes. Negative marking 0.5 per wrong answer.",
    config: {
      timing: { totalSec: 3600, warningSec: 300 },
      marking: { default: { marks: 2, negative: 0.5 }, bonusAllowed: true },
      navigation: { mode: "free" },
      questionTypes: ["SCQ"],
    },
    sections: sections as never,
  });
  console.log(
    `Created exam ${exam.slug} version ${version.version} id ${exam.id}`
  );
  console.log("Seed complete");
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
