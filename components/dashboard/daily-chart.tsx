import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  daily: Array<{ date: string; count: number }>;
}

export function DailyChart({ daily }: Props) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 7 Days</CardTitle>
        <CardDescription>Attempts per day</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-end gap-1">
          {daily.map((d) => {
            const h = Math.round((d.count / max) * 80) + 8;
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="flex w-full justify-center"
                  style={{ height: "88px" }}
                >
                  <div
                    className="bg-primary w-full max-w-10 rounded"
                    style={{ height: `${h}px`, alignSelf: "flex-end" }}
                    title={`${d.date}: ${d.count}`}
                  />
                </div>
                <span className="text-muted-foreground text-[10px]">
                  {d.date.slice(5).replace("-", "/")}
                </span>
                <span className="text-xs font-medium">{d.count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
