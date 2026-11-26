import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { Footer } from "@/app/footer";
import { Navbar } from "@/app/navbar";

export function Layout(): ReactNode {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
