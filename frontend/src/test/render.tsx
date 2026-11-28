import { render, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { vi } from "vitest";
import { Providers } from "@/app/providers";
import { routes } from "@/app/router";
import { createApiClient } from "@/lib/api";
import { setLocale, type Locale } from "@/lib/i18n/locale";
import { createQueryClient } from "@/lib/query-client";
import type { FakeApi } from "@/test/fake-api";

export function renderRoute(
  path: string,
  { api, locale = "de" }: { api: FakeApi; locale?: Locale },
): RenderResult & { user: UserEvent } {
  setLocale(locale);
  const queryClient = createQueryClient();
  // The real retry policy, without its back-off wait.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    // Under fake timers, user-event's own delays move the fake clock.
    user: userEvent.setup({
      advanceTimers: (ms) => {
        if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
      },
    }),
    ...render(
      <Providers
        api={createApiClient({ fetch: api.fetch })}
        queryClient={queryClient}
      >
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}
