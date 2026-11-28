import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetLocaleStore } from "@/lib/i18n/locale";
import { installMatchMedia, resetMedia } from "@/test/media";

installMatchMedia();

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetLocaleStore();
  resetMedia();
});
