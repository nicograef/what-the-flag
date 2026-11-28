import type { ReactNode } from "react";
import { cn } from "cn";
import { Outlet, useMatch } from "react-router";
import { Footer } from "@/app/footer";
import { Navbar } from "@/app/navbar";

/** The play route has no site header and no credit line; its own header takes the top inset. */
export function Layout(): ReactNode {
  const playing = useMatch("/play/:runId") !== null;

  return (
    <div className={cn("flex flex-col", playing ? "h-dvh" : "min-h-svh")}>
      {!playing && <Navbar />}
      <main
        className={cn(
          "mx-auto flex w-full max-w-md flex-1 flex-col px-4",
          playing
            ? "min-h-0 overflow-y-auto overscroll-y-contain pt-[max(1rem,env(safe-area-inset-top))]"
            : "pt-2 pb-6",
        )}
      >
        <Outlet />
      </main>
      {!playing && <Footer />}
    </div>
  );
}
