import { Clock, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { stripBlocks, type Cell } from "@/features/play/strip";

function Square({ cell }: { cell: Cell }): ReactNode {
  return (
    <span
      data-square={cell}
      className={cn(
        "flex size-3.5 items-center justify-center rounded-[3px]",
        cell === "correct" ? "bg-success" : "bg-danger text-danger-ink",
      )}
    >
      {cell === "wrong" && <X className="size-3" strokeWidth={4} />}
      {cell === "timeout" && <Clock className="size-3" strokeWidth={3} />}
    </span>
  );
}

/** The run as squares in blocks of five, two blocks per row; `label` says it in words. */
export function RunStrip({
  cells,
  label,
}: {
  cells: Cell[];
  label: string;
}): ReactNode {
  const { folded, blocks } = stripBlocks(cells);
  const rows: Cell[][][] = [];
  for (let i = 0; i < blocks.length; i += 2) rows.push(blocks.slice(i, i + 2));

  return (
    <div
      role="img"
      aria-label={label}
      className="flex flex-col items-center gap-1.5"
    >
      {folded !== null && (
        <span className="flex items-center gap-1.5 text-[15px] font-bold text-foreground-soft">
          <Square cell="correct" />×{folded}
        </span>
      )}
      {rows.map((row, r) => (
        <div key={r} className="flex gap-2.5">
          {row.map((block, b) => (
            <div key={b} className="flex gap-[3px]">
              {block.map((cell, c) => (
                <Square key={c} cell={cell} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
