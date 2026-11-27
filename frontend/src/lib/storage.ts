/** The stored value; blocked storage reads as nothing. */
export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores a value; blocked storage drops it, so it lasts for this page only. */
export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}
