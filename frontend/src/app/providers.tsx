import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiClientProvider, type ApiClient } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/locale";

export function Providers({
  api,
  queryClient,
  children,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  children: ReactNode;
}): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ApiClientProvider client={api}>{children}</ApiClientProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
