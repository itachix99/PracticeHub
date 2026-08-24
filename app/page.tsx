import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Phase 1 \u2022 Foundation</Badge>
            <Badge variant="outline">
              Next.js 15 \u2022 Tailwind v4 \u2022 shadcn/ui
            </Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            PracticeHub
            <span className="text-muted-foreground block text-2xl font-semibold sm:text-3xl">
              Generic Exam Engine \u2022 Realistic CBT Simulation
            </span>
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">
            Convert any previous-year paper into a realistic computer-based
            test. Phase 1 establishes the foundation \u2014 design system,
            layout, and tooling. Exam engine lands in Phase 3.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/exams">
                Browse Exams <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>

        <Alert>
          <FlaskConical className="size-4" />
          <AlertTitle>Approval-gated development</AlertTitle>
          <AlertDescription>
            This project proceeds phase by phase. No product logic has been
            implemented yet beyond the shell. Check{" "}
            <code>docs/DEVELOPMENT_ROADMAP.md</code> for the next phase.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="text-primary size-4" /> Design System
              </CardTitle>
              <CardDescription>Accessible primitives ready</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
              <Button size="sm" variant="outline">
                Outline
              </Button>
              <Button size="sm" variant="ghost">
                Ghost
              </Button>
              <Button size="sm" variant="destructive">
                Destructive
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="text-primary size-4" /> Type Safety
              </CardTitle>
              <CardDescription>Strict TS + Zod at boundaries</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <code className="bg-muted rounded px-1.5 py-0.5">lib/env.ts</code>{" "}
              validates env at boot.
              <br />
              <code className="bg-muted rounded px-1.5 py-0.5">
                lib/utils.ts
              </code>{" "}
              cn helper.
              <br />
              <code className="bg-muted rounded px-1.5 py-0.5">
                lib/db.ts
              </code>{" "}
              stub (Phase 3: Prisma).
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roadmap</CardTitle>
              <CardDescription>18 phases, approval-gated</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-sm">
                <li>Foundation \u2014 done</li>
                <li>Auth & Users \u2014 next</li>
                <li>Exam Engine</li>
                <li>Simulator UI</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Health Check</CardTitle>
            <CardDescription>
              API liveness probe for deployment & worker monitoring
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <code className="bg-muted rounded px-2 py-1 text-sm">
              GET /api/health
            </code>
            <span className="text-muted-foreground text-sm">
              {'\u2192 { status: "ok" }'}
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
