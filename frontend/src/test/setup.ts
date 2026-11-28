import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetLocaleStore } from "@/lib/i18n/locale";
import { installDialog } from "@/test/dialog";
import { installMatchMedia, resetMedia } from "@/test/media";

installMatchMedia();
installDialog();

// Testing Library advances fake timers inside waitFor and findBy only where it sees Jest's API.
Object.assign(globalThis, {
  jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetLocaleStore();
  resetMedia();
});
