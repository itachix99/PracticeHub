import { requireAuth } from "@/lib/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const session = await requireAuth();
  const user = session.user as unknown as { id: string; email?: string; name?: string; role?: string };

  // Fetch recent users count to prove DB works (optional)
  const totalUsers = await prisma.user.count();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {user.name || user.email} • Role: <Badge variant="secondary">{user.role || "STUDENT"}</Badge>
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </div>
            <div>
              <span className="text-muted-foreground">User ID:</span> {user.id}
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span> {user.role}
            </div>
            <div>
              <span className="text-muted-foreground">Total users in system:</span> {totalUsers}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>No attempts yet</CardTitle>
            <CardDescription>Phase 6 will show exam history, scores, and analytics</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This dashboard is protected — unauthenticated users are redirected to /login and logged-in users
            cannot visit /login again (middleware). Role guards are ready for Moderator/Admin.
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Authorization Test</CardTitle>
          <CardDescription>Verify RBAC before Phase 3</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            Try accessing <code className="rounded bg-muted px-1">/dashboard</code> without login → redirects
            to <code className="rounded bg-muted px-1">/login?callbackUrl=/dashboard</code>. Try visiting
            <code className="rounded bg-muted px-1">/login</code> while logged in → redirects to
            <code className="rounded bg-muted px-1">/dashboard</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
