export function wireDropdown(wrap: HTMLElement, btn: HTMLButtonElement, panel: HTMLElement, onOpen?: () => void): () => void {
    function closePanel(): void {
        panel.hidden = true;
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
    }

    function onOutsideMouseDown(e: MouseEvent): void {
        if (wrap.contains(e.target as Node)) return;
        closePanel();
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") closePanel();
    }

    btn.addEventListener("click", () => {
        if (panel.hidden) {
            onOpen?.();
            panel.hidden = false;
            document.addEventListener("mousedown", onOutsideMouseDown, true);
            document.addEventListener("keydown", onKeyDown, true);
        } else {
            closePanel();
        }
    });
    return closePanel;
}
