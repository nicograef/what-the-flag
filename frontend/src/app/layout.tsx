import type { ReactNode } from "react";
import { cn } from "cn";
import { Outlet, useMatch } from "react-router";
import { Footer } from "@/app/footer";
import { Navbar } from "@/app/navbar";

export function Layout(): ReactNode {
  const playing = useMatch("/play/:runId") !== null;

  return (
    <div className={cn("flex flex-col", playing ? "h-dvh" : "min-h-svh")}>
      <Navbar />
      <main
        className={cn(
          "mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4",
          playing
            ? "min-h-0 overflow-y-auto overscroll-y-contain pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "pb-8",
        )}
      >
        <Outlet />
      </main>
      {!playing && <Footer />}
    </div>
  );
}
