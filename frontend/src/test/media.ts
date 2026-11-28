/** The media features the fake `matchMedia` answers; anything else does not match. */
interface Media {
  coarse: boolean;
  reducedMotion: boolean;
}

const defaults: Media = { coarse: false, reducedMotion: false };
let media: Media = { ...defaults };

function matches(query: string): boolean {
  if (query.includes("pointer: coarse")) return media.coarse;
  if (query.includes("pointer: fine")) return !media.coarse;
  if (query.includes("prefers-reduced-motion: reduce")) {
    return media.reducedMotion;
  }
  return false;
}

/** Switches the faked media features; set it before rendering. */
export function setMedia(next: Partial<Media>): void {
  media = { ...media, ...next };
}

export function resetMedia(): void {
  media = { ...defaults };
}

/** jsdom has no `matchMedia`; this one reads the features `setMedia` sets. */
export function installMatchMedia(): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      media: query,
      matches: matches(query),
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
