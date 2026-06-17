import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  className?: string;
}

export function StatCard({ label, value, hint, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <p
          className={cn(
            "mt-3 text-xs font-medium",
            trend.positive ? "text-success" : "text-destructive",
          )}
        >
          {trend.value}
        </p>
      )}
    </Card>
  );
}
