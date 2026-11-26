import { expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { createQueryClient } from "@/lib/query-client";

it.each([
  {
    name: "network",
    failureCount: 0,
    error: new ApiError(0, "network", "m"),
    retried: true,
  },
  {
    name: "503",
    failureCount: 1,
    error: new ApiError(503, "database_unavailable", "m"),
    retried: true,
  },
  {
    name: "404",
    failureCount: 0,
    error: new ApiError(404, "not_found", "m"),
    retried: false,
  },
  {
    name: "invalid_response",
    failureCount: 0,
    error: new ApiError(200, "invalid_response", "m"),
    retried: false,
  },
  {
    name: "a third failure",
    failureCount: 2,
    error: new ApiError(503, "internal", "m"),
    retried: false,
  },
])("query retry on $name: $retried", ({ failureCount, error, retried }) => {
  const { retry } = createQueryClient().getDefaultOptions().queries ?? {};
  if (typeof retry !== "function") throw new Error("retry is no function");

  expect(retry(failureCount, error)).toBe(retried);
});
