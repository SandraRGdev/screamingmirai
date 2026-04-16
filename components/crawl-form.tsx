"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Search, Layers, Zap } from "lucide-react";
import type { CrawlOptions } from "@/hooks/use-crawl-stream";

const MAX_DEPTH = 50;
const MAX_PAGES = 5000;

export function CrawlForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (options: CrawlOptions) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [useJs, setUseJs] = useState(false);
  const [crawlScope, setCrawlScope] = useState<"site" | "section">("site");

  useEffect(() => {
    if (!url.trim()) return;

    try {
      const parsed = new URL(url);
      const normalizedPath = parsed.pathname.replace(/\/$/, "") || "/";
      setCrawlScope(normalizedPath === "/" ? "site" : "section");
    } catch {
      // Ignore incomplete/invalid URLs while the user is typing.
    }
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit({
        url: url.trim(),
        maxDepth: MAX_DEPTH,
        maxPages: MAX_PAGES,
        useJs,
        respectRobotsTxt: true,
        crawlScope,
      });
    }
  };

  return (
    <Card className="overflow-hidden border-border/60 bg-card/85 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.32)]">
      <div className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-5 sm:px-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-balance">
          <Search className="h-5 w-5 text-primary" />
          Configurar rastreo
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Introduce la URL de inicio y ajusta los parametros del rastreo
        </p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-6 sm:p-8">
        <div className="space-y-2">
          <Label htmlFor="url" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            URL de inicio
          </Label>
          <Input
            id="url"
            type="url"
            placeholder="https://ejemplo.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            required
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scope" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Alcance del rastreo
          </Label>
          <select
            id="scope"
            value={crawlScope}
            onChange={(e) => setCrawlScope(e.target.value as "site" | "section")}
            disabled={disabled}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="site">Toda la web</option>
            <option value="section">Solo este idioma o ruta</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Usa la URL base para toda la web, o una ruta como /ca/ o /fr/ para rastrear solo esa sección.
          </p>
        </div>

        <div className="flex items-center gap-3 py-1">
          <Switch
            id="js"
            checked={useJs}
            onCheckedChange={setUseJs}
            disabled={disabled}
          />
          <Label htmlFor="js" className="flex items-center gap-1.5 cursor-pointer">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            Usar renderizado JavaScript (mas lento)
          </Label>
        </div>

        <Button
          type="submit"
          disabled={disabled || !url.trim()}
          className="h-12 w-full rounded-full !bg-[#c71827] px-6 text-sm font-semibold uppercase tracking-[0.12em] !text-white shadow-[0_14px_30px_-12px_rgba(199,24,39,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:!bg-[#ab1320] focus-visible:!ring-[#c71827]/30"
        >
          {disabled ? "Rastreando..." : "Iniciar rastreo"}
        </Button>
      </form>
    </Card>
  );
}
