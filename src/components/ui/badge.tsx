import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border-transparent",
        primary: "bg-primary/10 text-primary border-primary/20",
        accent: "bg-accent/15 text-accent-foreground border-accent/25",
        success: "bg-success/12 text-success border-success/25",
        warning: "bg-warning/15 text-warning-foreground border-warning/30",
        destructive: "bg-destructive/12 text-destructive border-destructive/25",
        outline: "text-foreground border-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
