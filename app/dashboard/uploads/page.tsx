import { requireAuth } from "@/lib/auth/guards";
import { UploadManager } from "@/components/uploads/upload-manager";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  await requireAuth();
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload Papers</h1>
          <p className="text-muted-foreground text-sm">
            Secure pipeline • private storage • job statuses
          </p>
        </div>
        <Badge variant="secondary">Phase 7</Badge>
      </div>
      <UploadManager />
    </div>
  );
}
