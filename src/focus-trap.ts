const FOCUSABLE_SELECTOR =
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function focusablesWithin(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null);
}

export function trapFocus(container: HTMLElement, fallback: HTMLElement): () => void {
    function onKeyDown(e: KeyboardEvent): void {
        if (e.defaultPrevented || e.key !== "Tab") return;
        const focusables = focusablesWithin(container);
        if (!focusables.length) {
            e.preventDefault();
            fallback.focus();
            return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (!container.contains(document.activeElement)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
}
