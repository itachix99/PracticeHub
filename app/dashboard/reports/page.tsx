import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ReportsTable } from "@/components/reports/reports-table";

export const dynamic = "force-dynamic";

interface SearchParams { status?: string }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("MODERATOR");
  const { status } = await searchParams;
  const filterStatus = status && ["OPEN","RESOLVED","REJECTED"].includes(status) ? status as "OPEN"|"RESOLVED"|"REJECTED" : undefined;
  const reports = await prisma.report.findMany({
    where: filterStatus ? { status: filterStatus as never } : {},
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      exam: { select: { id: true, title: true, slug: true } },
      question: { select: { id: true, text: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await prisma.report.groupBy({ by: ["status"], _count: { status: true } });
  const countMap = Object.fromEntries(counts.map(c => [c.status, c._count.status])) as Record<string, number>;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moderation Queue</h1>
          <p className="text-sm text-muted-foreground">Review community reports • {reports.length} shown</p>
        </div>
        <Badge variant="secondary">Moderator</Badge>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/reports"><Button variant={!filterStatus ? "default" : "outline"} size="sm">All ({counts.reduce((s,c)=>s+c._count.status,0)})</Button></Link>
        <Link href="/dashboard/reports?status=OPEN"><Button variant={filterStatus==="OPEN"?"default":"outline"} size="sm">Open ({countMap["OPEN"] ?? 0})</Button></Link>
        <Link href="/dashboard/reports?status=RESOLVED"><Button variant={filterStatus==="RESOLVED"?"default":"outline"} size="sm">Resolved ({countMap["RESOLVED"] ?? 0})</Button></Link>
        <Link href="/dashboard/reports?status=REJECTED"><Button variant={filterStatus==="REJECTED"?"default":"outline"} size="sm">Rejected ({countMap["REJECTED"] ?? 0})</Button></Link>
      </div>

      <ReportsTable reports={reports.map(r=>({ ...r, reporter: r.reporter, exam: r.exam, question: r.question }))} />
    </div>
  );
}
