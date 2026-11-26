import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { useApiClient, type ApiClient } from "@/lib/api";

export const healthSchema = z.object({ status: z.literal("ok") });

export type Health = z.infer<typeof healthSchema>;

export function getHealth(api: ApiClient): Promise<Health> {
  return api.get("/api/health", healthSchema);
}

export function useHealth(): UseQueryResult<Health> {
  const api = useApiClient();
  return useQuery({ queryKey: ["health"], queryFn: () => getHealth(api) });
}
