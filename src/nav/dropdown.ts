import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";

let dropdownId = 0;

export function wireDropdown(wrap: HTMLElement, btn: HTMLButtonElement, panel: HTMLElement, onOpen?: () => void): () => void {
    dropdownId += 1;
    if (!panel.id) panel.id = `site-dropdown-${dropdownId}`;
    btn.setAttribute("aria-controls", panel.id);
    btn.setAttribute("aria-expanded", "false");

    function closePanel(restoreFocus: boolean): void {
        if (panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        closeDismissibleSurface(panel);
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
        if (restoreFocus && btn.isConnected) btn.focus();
    }

    function onOutsideMouseDown(e: MouseEvent): void {
        if (wrap.contains(e.target as Node)) return;
        closePanel(false);
    }

    btn.addEventListener("click", () => {
        if (panel.hidden) {
            onOpen?.();
            panel.hidden = false;
            btn.setAttribute("aria-expanded", "true");
            openDismissibleSurface(panel, () => closePanel(true));
            document.addEventListener("mousedown", onOutsideMouseDown, true);
        } else {
            closePanel(false);
        }
    });
    return () => closePanel(true);
}
