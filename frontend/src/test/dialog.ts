/**
 * jsdom has an empty `HTMLDialogElement`. This fake opens and closes it by its `open` attribute,
 * moves focus in as `showModal()` does, and turns Escape into a cancelable `cancel` event.
 */
export function installDialog(): void {
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>(
      "button, [href], input, [tabindex]:not([tabindex='-1'])",
    )?.focus();
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) {
      dialog.close();
    }
  });
}
