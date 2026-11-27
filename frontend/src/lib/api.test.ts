import { describe, expect, it } from "vitest";
import { z } from "zod/mini";
import { ApiError, createApiClient } from "@/lib/api";
import { FakeApi } from "@/test/fake-api";

const okSchema = z.object({ ok: z.boolean() });

function setup(): { api: FakeApi; client: ReturnType<typeof createApiClient> } {
  const api = new FakeApi();
  return { api, client: createApiClient({ fetch: api.fetch }) };
}

describe("createApiClient", () => {
  it("sends credentials, and JSON with a body on unsafe methods", async () => {
    const { api, client } = setup();
    api
      .respond("GET /api/x", { ok: true })
      .respond("POST /api/x", { ok: true });

    await client.get("/api/x", okSchema);
    await client.post("/api/x", okSchema, { name: "Lena" });
    await client.post("/api/x", okSchema);

    expect(
      api.calls.map((c) => [c.init.credentials, c.init.headers, c.body]),
    ).toEqual([
      ["same-origin", undefined, undefined],
      ["same-origin", { "Content-Type": "application/json" }, { name: "Lena" }],
      ["same-origin", { "Content-Type": "application/json" }, {}],
    ]);
  });

  it("turns an error envelope into an ApiError with its field", async () => {
    const { api, client } = setup();
    api.fail("POST /api/x", 400, "invalid_json", "name");

    await expect(client.post("/api/x", okSchema, {})).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
      field: "name",
    });
  });

  it("rejects a body that misses the schema as invalid_response", async () => {
    const { api, client } = setup();
    api.respond("GET /api/x", { ok: "yes" });

    await expect(client.get("/api/x", okSchema)).rejects.toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });

  it("turns a rejected fetch into a network error", async () => {
    const client = createApiClient({
      fetch: () => Promise.reject(new TypeError("offline")),
    });

    const err: unknown = await client
      .get("/api/x", okSchema)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "network" });
  });
});
