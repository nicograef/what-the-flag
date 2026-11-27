import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import { z } from "zod/mini";

export interface ApiClient {
  get<T>(path: string, schema: z.ZodMiniType<T>): Promise<T>;
  post: <T>(
    path: string,
    schema: z.ZodMiniType<T>,
    body?: unknown,
  ) => Promise<T>;
}

/** `code` is the server's envelope code, or `network` / `invalid_response` from the client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { field?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = options?.field;
  }
}

const envelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.optional(z.string()),
  }),
});

type Method = "GET" | "POST";

export function createApiClient(deps: { fetch: typeof fetch }): ApiClient {
  // Called unbound: the browser's fetch throws "Illegal invocation" when `this` is `deps`.
  const { fetch: send } = deps;

  async function request<T>(
    method: Method,
    path: string,
    schema: z.ZodMiniType<T>,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = { method, credentials: "same-origin" };
    if (method !== "GET") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body ?? {});
    }

    let res: Response;
    try {
      res = await send(path, init);
    } catch (cause) {
      throw new ApiError(0, "network", `${method} ${path} failed`, { cause });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (cause) {
      throw new ApiError(
        res.status,
        "invalid_response",
        `${method} ${path}: body is no JSON`,
        { cause },
      );
    }

    if (!res.ok) {
      const envelope = envelopeSchema.safeParse(data);
      if (!envelope.success) {
        throw new ApiError(
          res.status,
          "invalid_response",
          `${method} ${path}: no error envelope`,
        );
      }
      const { code, message, field } = envelope.data.error;
      throw new ApiError(res.status, code, message, { field });
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        res.status,
        "invalid_response",
        `${method} ${path}: unexpected shape`,
        {
          cause: parsed.error,
        },
      );
    }
    return parsed.data;
  }

  return {
    get: (path, schema) => request("GET", path, schema),
    post: (path, schema, body) => request("POST", path, schema, body),
  };
}

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: ApiClient;
  children: ReactNode;
}): ReactNode {
  return createElement(ApiClientContext, { value: client }, children);
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("useApiClient needs an ApiClientProvider");
  return client;
}
