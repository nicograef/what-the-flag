import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetLocaleStore } from "@/lib/i18n/locale";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetLocaleStore();
});
