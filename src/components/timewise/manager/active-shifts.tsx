"use client";

import type { Session } from "@/shared/types/domain";
import { minutesToHHMM } from "@/lib/time-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ActiveShiftsProps {
  activeShifts: Session[];
}

export function ActiveShifts({ activeShifts }: ActiveShiftsProps) {
  return (
    <Card className="rounded-2xl border bg-gradient-to-b from-card to-card/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Active Shifts</CardTitle>
          <Badge className="bg-green-600 text-white">Live</Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-48 pr-2">
          {activeShifts.length > 0 ? (
            <ul className="space-y-3">
              {activeShifts.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2 transition hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-semibold">
                        {s.employee.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="leading-tight">
                      <p className="font-medium">{s.employee}</p>
                      <p className="text-xs text-muted-foreground">Clocked in</p>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className="font-mono text-sm bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                  >
                    {minutesToHHMM(s.minutes)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No one is currently clocked in.
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
