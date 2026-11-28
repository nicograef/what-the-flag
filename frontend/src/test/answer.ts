import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

/** Answers with the option named `name`: Enter on it once arming ends. */
export async function answer(
  user: UserEvent,
  name: string | RegExp,
): Promise<void> {
  const option = await screen.findByRole("button", { name });
  await waitFor(() => expect(option).not.toHaveAttribute("aria-disabled"));
  option.focus();
  await user.keyboard("{Enter}");
}

/** Clicks the button named `name` once it shows, after a reveal, and its guard has lifted. */
export async function press(
  user: UserEvent,
  name: string | RegExp,
): Promise<void> {
  const button = await screen.findByRole("button", { name }, { timeout: 3000 });
  await waitFor(() => expect(button).not.toHaveAttribute("aria-disabled"), {
    timeout: 2000,
  });
  await user.click(button);
}
