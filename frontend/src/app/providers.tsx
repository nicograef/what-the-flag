import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { ApiClientProvider, type ApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";

function DocumentLang({ children }: { children: ReactNode }): ReactNode {
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return children;
}

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
      <DocumentLang>
        <ApiClientProvider client={api}>{children}</ApiClientProvider>
      </DocumentLang>
    </QueryClientProvider>
  );
}
