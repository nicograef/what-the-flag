import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

function healthyApi(): FakeApi {
  return new FakeApi().respond("GET /api/health", { status: "ok" });
}

it("shows the online status in German", async () => {
  renderRoute("/", { api: healthyApi() });

  expect(await screen.findByText("Server ist erreichbar.")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "What The Flag" }),
  ).toBeInTheDocument();
});

it("shows the error text when the database is unavailable", async () => {
  const api = new FakeApi().fail(
    "GET /api/health",
    503,
    "database_unavailable",
  );
  renderRoute("/", { api });

  expect(
    await screen.findByText("Die Datenbank ist gerade nicht erreichbar."),
  ).toBeInTheDocument();
});

it("shows the not-found page on an unknown path", async () => {
  renderRoute("/nope", { api: healthyApi() });

  expect(
    await screen.findByText("Diese Seite gibt es nicht."),
  ).toBeInTheDocument();
});

it("switches to English without a second health request", async () => {
  const api = healthyApi();
  const { user } = renderRoute("/", { api });
  await screen.findByText("Server ist erreichbar.");

  await user.click(screen.getByRole("button", { name: "English" }));

  expect(screen.getByText("Server is online.")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem("wtf.locale")).toBe("en");
  expect(api.calls.filter((c) => c.route === "GET /api/health")).toHaveLength(
    1,
  );
});

it("links the footer to the NOTICE file", () => {
  renderRoute("/", { api: healthyApi() });

  expect(screen.getByRole("link", { name: /Länderdaten/ })).toHaveAttribute(
    "href",
    expect.stringMatching(/\/NOTICE$/),
  );
});
