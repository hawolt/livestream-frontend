import { $ } from "./dom.ts";

let modalReturnFocus: HTMLElement | null = null;

function modalFocusables(): HTMLElement[] {
    return Array.from($("modal").querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter(el => el.offsetParent !== null);
}

function onModalKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
    }
    if (e.key !== "Tab") return;
    const focusables = modalFocusables();
    if (!focusables.length) {
        e.preventDefault();
        $("modal-box").focus();
        return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (!$("modal").contains(document.activeElement)) {
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

export function openModal(title: string, body: string, footer = ""): void {
    const modal = $("modal");
    if (!modal.classList.contains("open")) {
        modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    $("modal-title").textContent = title;
    $("modal-body").innerHTML    = body;
    $("modal-foot").innerHTML    = footer;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.removeEventListener("keydown", onModalKeyDown);
    document.addEventListener("keydown", onModalKeyDown);
    requestAnimationFrame(() => {
        if (!modal.classList.contains("open")) return;
        const initial = $("modal-body").querySelector<HTMLElement>(
            "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]",
        );
        (initial ?? modalFocusables()[0] ?? $("modal-box")).focus();
    });
}
export function closeModal(): void {
    const modal = $("modal");
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onModalKeyDown);
    const returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
}
$("modal-close").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
(window as unknown as Record<string,unknown>)["closeModal"] = closeModal;
