/** A recorded request; `route` reads like `"GET /api/health"`. */
interface FakeCall {
  route: string;
  body: unknown;
  init: RequestInit;
}

export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

/** A reply a body function returns when it answers with a status of its own. */
export class StatusReply {
  readonly status: number;
  readonly body: Json;

  constructor(status: number, body: Json) {
    this.status = status;
    this.body = body;
  }
}

/** A one-shot trouble: a lost request or response, or an error envelope. */
type Upset =
  | { kind: "lost"; delivered: boolean }
  | { kind: "error"; status: number; code: string };

type Reply = {
  status: number;
  body: Json | ((call: FakeCall) => Json | StatusReply);
};

/** The fake server behind `createApiClient`; an unknown route rejects with its name. */
export class FakeApi {
  readonly calls: FakeCall[] = [];
  private readonly replies = new Map<string, Reply>();
  /** One-shot replies that take the place of a route's next fetches, in order. */
  private readonly upsets = new Map<string, Upset[]>();

  respond(
    route: string,
    body: Json | ((call: FakeCall) => Json | StatusReply),
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

  /**
   * The route's next fetch fails as the network does. `delivered` lets the server handle the
   * request first, so only its response is lost.
   */
  reject(route: string, { delivered = false } = {}): this {
    return this.upset(route, { kind: "lost", delivered });
  }

  /** The route's next fetch answers with an error envelope; later ones reply as before. */
  failOnce(route: string, status: number, code: string): this {
    return this.upset(route, { kind: "error", status, code });
  }

  private upset(route: string, upset: Upset): this {
    this.upsets.set(route, [...(this.upsets.get(route) ?? []), upset]);
    return this;
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

    const upset = this.upsets.get(call.route)?.shift();
    if (upset?.kind === "error") {
      return new Response(
        JSON.stringify({
          error: { code: upset.code, message: `fake ${upset.code}` },
        }),
        {
          status: upset.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const lost = upset?.kind === "lost" ? upset : undefined;
    if (lost && !lost.delivered) throw new TypeError("Failed to fetch");

    const reply = this.replies.get(call.route);
    if (!reply) throw new Error(`FakeApi: no reply for ${call.route}`);

    const out =
      typeof reply.body === "function" ? reply.body(call) : reply.body;
    if (lost) throw new TypeError("Failed to fetch");
    const { status, body } =
      out instanceof StatusReply ? out : { status: reply.status, body: out };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
