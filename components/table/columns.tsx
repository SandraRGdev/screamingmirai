"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "./data-table-column-header";
import type { CrawlResult } from "@/lib/types";

export const columns: ColumnDef<CrawlResult>[] = [
  {
    accessorKey: "url",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL" />
    ),
    cell: ({ row }) => {
      const url = row.getValue("url") as string;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline truncate max-w-[300px] block"
        >
          {url}
        </a>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as number;
      return (
        <Badge
          variant="default"
          className={
            status < 400
              ? "rounded-full bg-[#333333] px-3 py-1 text-sm font-semibold text-white shadow-sm"
              : "rounded-full border border-[#c71827]/20 bg-[#c71827] px-3 py-1 text-sm font-semibold text-white shadow-sm"
          }
        >
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "depth",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Profundidad" />
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    ),
    cell: ({ row }) => {
      const title = row.getValue("title") as string | null;
      return (
        <span className="truncate max-w-[200px] block">
          {title || "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "lang",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Idioma" />
    ),
    cell: ({ row }) => {
      const lang = row.getValue("lang") as string | null;
      return (
        <Badge
          variant="secondary"
          className={
            lang
              ? "rounded-full border border-[#c71827]/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#333333] shadow-sm"
              : "rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          }
        >
          {lang || "—"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "esIndexable",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Indexable" />
    ),
    cell: ({ row }) => {
      const indexable = row.getValue("esIndexable") as boolean;
      return (
        <Badge
          variant="secondary"
          className={
            indexable
              ? "rounded-full bg-[#c71827] px-3 py-1 text-xs font-semibold text-white shadow-sm"
              : "rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-[#333333] shadow-sm"
          }
        >
          {indexable ? "Sí" : "No"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "inlinks",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Enlaces entrantes" />
    ),
  },
];
