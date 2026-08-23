"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface ExamFiltersProps {
  organizations: Array<{ id: string; name: string; slug: string }>;
}

export function ExamFilters({ organizations }: ExamFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const org = searchParams.get("organization") || "";
  const sort = searchParams.get("sort") || "latest";

  const [search, setSearch] = React.useState(q);

  // Sync when URL changes via back/forward
  React.useEffect(() => { setSearch(q); }, [q]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Reset page when filters change
    if (key !== "page") params.delete("page");
    router.push(`/exams?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam("q", search.trim());
  };

  const clearFilters = () => {
    router.push("/exams");
  };

  const hasFilters = !!q || !!org || sort !== "latest";

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-end sm:justify-between">
      <form onSubmit={handleSearch} className="flex flex-1 flex-col gap-2 sm:max-w-md">
        <Label htmlFor="search">Search</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input id="search" placeholder="Search title or slug…" value={search} onChange={e=>setSearch(e.target.value)} className="pl-8" />
          </div>
          <Button type="submit">Search</Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="org">Organization</Label>
          <select id="org" value={org} onChange={e=>updateParam("organization", e.target.value)} className="flex h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All</option>
            {organizations.map(o=> <option key={o.id} value={o.slug}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sort">Sort</Label>
          <select id="sort" value={sort} onChange={e=>updateParam("sort", e.target.value)} className="flex h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        {hasFilters && <Button variant="outline" onClick={clearFilters} className="self-end gap-1"><X className="size-4"/>Clear</Button>}
      </div>
    </div>
  );
}
