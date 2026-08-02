export interface DismissibleSurfaceStack {
    open(key: object, dismiss: () => void, active?: () => boolean): void;
    close(key: object): void;
    takeTop(): (() => void) | null;
    size(): number;
}

interface DismissibleSurfaceEntry {
    key: object;
    dismiss: () => void;
    active: () => boolean;
}

export function createDismissibleSurfaceStack(): DismissibleSurfaceStack {
    const entries: DismissibleSurfaceEntry[] = [];

    function close(key: object): void {
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i]!.key === key) entries.splice(i, 1);
        }
    }

    return {
        open(key, dismiss, active = () => true) {
            close(key);
            entries.push({ key, dismiss, active });
        },
        close,
        takeTop() {
            while (entries.length > 0) {
                const entry = entries.pop()!;
                if (entry.active()) return entry.dismiss;
            }
            return null;
        },
        size() {
            return entries.length;
        },
    };
}

const surfaceStack = createDismissibleSurfaceStack();

export function openDismissibleSurface(element: HTMLElement, dismiss: () => void): void {
    surfaceStack.open(element, dismiss, () => element.isConnected);
}

export function closeDismissibleSurface(element: HTMLElement): void {
    surfaceStack.close(element);
}

function dismissSurfaceOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const dismiss = surfaceStack.takeTop();
    if (!dismiss) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("keydown", dismissSurfaceOnEscape, true);
}
