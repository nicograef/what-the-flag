import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

const maxRetries = 2;

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= maxRetries) return false;
  return (
    error instanceof ApiError &&
    (error.code === "network" || error.status >= 500)
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
