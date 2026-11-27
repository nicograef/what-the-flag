import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { fakeRun, sampleQuestions } from "@/features/play/fake-run";
import { FakeApi } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

it("prefills the stored name", () => {
  localStorage.setItem("wtf.name", "Ada");

  renderRoute("/", { api: new FakeApi() });

  expect(screen.getByLabelText("Dein Name")).toHaveValue("Ada");
  expect(
    screen.getByText("Dein Name erscheint öffentlich in den Ranglisten."),
  ).toBeInTheDocument();
});

it("starts a run and plays it", async () => {
  const api = new FakeApi();
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await user.type(screen.getByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  expect(api.calls.map((c) => c.route)).toEqual([
    "POST /api/runs",
    "GET /api/runs/00000000-0000-4000-8000-000000000002",
  ]);
  expect(api.calls[0]?.body).toEqual({ name: "Bea" });
  expect(localStorage.getItem("wtf.name")).toBe("Bea");
});

it.each([
  {
    code: "invalid_name",
    status: 400,
    field: "name",
    text: "Erlaubt sind 1 bis 20 Zeichen mit mindestens einem Buchstaben oder einer Ziffer: Buchstaben, Ziffern, Leerzeichen, _, - und Punkt.",
    invalid: "true",
  },
  {
    code: "rate_limited",
    status: 429,
    field: undefined,
    text: "Zu viele Anfragen auf einmal. Warte kurz und versuch es noch einmal.",
    invalid: "false",
  },
])("shows $code", async ({ code, status, field, text, invalid }) => {
  const api = new FakeApi().fail("POST /api/runs", status, code, field);
  const { user } = renderRoute("/", { api });
  const input = screen.getByLabelText("Dein Name");

  await user.type(input, "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(text);
  expect(input).toHaveAttribute("aria-invalid", invalid);
  if (field) expect(input).toHaveAccessibleDescription(new RegExp(`^${text}`));
});

it("shows the not-found page on an unknown path", async () => {
  renderRoute("/nope", { api: new FakeApi() });

  expect(
    await screen.findByText("Diese Seite gibt es nicht."),
  ).toBeInTheDocument();
});

it("links the footer to the NOTICE file", () => {
  renderRoute("/", { api: new FakeApi() });

  expect(screen.getByRole("link", { name: /Länderdaten/ })).toHaveAttribute(
    "href",
    expect.stringMatching(/\/NOTICE$/),
  );
});
