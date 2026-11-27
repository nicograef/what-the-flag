/** A recorded request; `route` reads like `"GET /api/health"`. */
interface FakeCall {
  route: string;
  body: unknown;
  init: RequestInit;
}

export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

type Reply = { status: number; body: Json | ((call: FakeCall) => Json) };

/** The fake server behind `createApiClient`; an unknown route rejects with its name. */
export class FakeApi {
  readonly calls: FakeCall[] = [];
  private readonly replies = new Map<string, Reply>();

  respond(
    route: string,
    body: Json | ((call: FakeCall) => Json),
    status = 200,
  ): this {
    this.replies.set(route, { status, body });
    return this;
  }

  fail(route: string, status: number, code: string, field?: string): this {
    const error: Json = { code, message: `fake ${code}` };
    if (field !== undefined) error.field = field;
    return this.respond(route, { error }, status);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    const path =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const call: FakeCall = {
      route: `${method} ${path}`,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      init: init ?? {},
    };
    this.calls.push(call);

    const reply = this.replies.get(call.route);
    if (!reply) throw new Error(`FakeApi: no reply for ${call.route}`);

    const body =
      typeof reply.body === "function" ? reply.body(call) : reply.body;
    return new Response(JSON.stringify(body), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
