import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import { createApiClient } from "@/lib/api";
import { createQueryClient } from "@/lib/query-client";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers
      api={createApiClient({ fetch })}
      queryClient={createQueryClient()}
    >
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
