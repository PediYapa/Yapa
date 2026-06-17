"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div>
        <h2 className="font-display text-lg font-semibold">Algo deu errado</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {error.message || "Ocorreu um erro inesperado. Tente novamente."}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
