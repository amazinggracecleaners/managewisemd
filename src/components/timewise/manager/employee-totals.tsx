"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface EmployeeTotalsProps {
  totals: { employee: string; minutes: number }[];
}

export function EmployeeTotals({ totals }: EmployeeTotalsProps) {
  const fmtHM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Card className="rounded-2xl border bg-gradient-to-b from-card to-card/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Hours by Employee
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-48 pr-2">
          {totals.length > 0 ? (
            <ul className="space-y-2">
              {totals.map((t, i) => (
                <li
                  key={t.employee}
                  className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2 hover:bg-accent/40 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">
                      #{i + 1}
                    </span>
                    <span className="font-medium">
                      {t.employee}
                    </span>
                  </div>

                  <Badge
                    className="font-mono bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {fmtHM(t.minutes)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No time recorded yet.
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
