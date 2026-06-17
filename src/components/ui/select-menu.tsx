"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string };

interface SelectMenuProps {
  options: SelectOption[];
  /** Controlado: valor atual. Se omitido, usa estado interno (defaultValue). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Quando true, mostra spinner e desabilita (ex.: navegação em andamento). */
  pending?: boolean;
  disabled?: boolean;
  /** Se definido, renderiza um input hidden com este name (uso em formulários). */
  name?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Dropdown estilizado do design system (substitui o <select> nativo do SO).
 * Acessível: teclado (setas/Enter/Esc/Home/End), clique-fora, foco. Dark-mode
 * via tokens. Posicionado abaixo do trigger.
 */
export function SelectMenu({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Selecionar…",
  pending = false,
  disabled = false,
  name,
  className,
  "aria-label": ariaLabel,
}: SelectMenuProps) {
  const [interno, setInterno] = React.useState(defaultValue ?? "");
  const atual = value !== undefined ? value : interno;
  const selecionado = options.find((o) => o.value === atual) ?? null;

  const [aberto, setAberto] = React.useState(false);
  const [ativo, setAtivo] = React.useState(0); // índice destacado
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listaRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const indiceAtual = Math.max(0, options.findIndex((o) => o.value === atual));

  function escolher(v: string) {
    if (value === undefined) setInterno(v);
    onValueChange?.(v);
    setAberto(false);
  }

  function abrir() {
    if (disabled || pending) return;
    setAtivo(indiceAtual);
    setAberto(true);
  }

  // clique-fora
  React.useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  // rola até o item ativo
  React.useEffect(() => {
    if (!aberto || !listaRef.current) return;
    const el = listaRef.current.children[ativo] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled || pending) return;
    if (!aberto) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setAtivo((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setAtivo((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setAtivo(0);
        break;
      case "End":
        e.preventDefault();
        setAtivo(options.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (options[ativo]) escolher(options[ativo].value);
        break;
      case "Escape":
        e.preventDefault();
        setAberto(false);
        break;
      case "Tab":
        setAberto(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={atual} />}
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          aberto && "ring-2 ring-ring",
        )}
      >
        <span className={cn("truncate", !selecionado && "text-muted-foreground")}>
          {selecionado?.label ?? placeholder}
        </span>
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
        )}
      </button>

      {aberto && (
        <ul
          ref={listaRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className={cn(
            "absolute z-50 mt-1 max-h-72 w-full min-w-[10rem] overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          {options.map((o, i) => {
            const sel = o.value === atual;
            return (
              <li key={o.value} role="option" aria-selected={sel}>
                <button
                  type="button"
                  onClick={() => escolher(o.value)}
                  onMouseEnter={() => setAtivo(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    i === ativo ? "bg-secondary text-foreground" : "text-foreground/90",
                    sel && "font-medium",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {sel && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
