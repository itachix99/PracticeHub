import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props { daily: Array<{ date: string; count: number }> }

export function DailyChart({ daily }: Props) {
  const max = Math.max(1, ...daily.map(d=>d.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 7 Days</CardTitle>
        <CardDescription>Attempts per day</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-24">
          {daily.map((d)=>{
            const h = Math.round((d.count / max) * 80) + 8;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full flex justify-center" style={{height: "88px"}}>
                  <div className="w-full max-w-10 rounded bg-primary" style={{height: `${h}px`, alignSelf: "flex-end"}} title={`${d.date}: ${d.count}`} />
                </div>
                <span className="text-[10px] text-muted-foreground">{d.date.slice(5).replace("-","/")}</span>
                <span className="text-xs font-medium">{d.count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
