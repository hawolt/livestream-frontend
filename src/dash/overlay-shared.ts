import { getMe } from "./core.ts";

export const PREVIEW_DEBOUNCE_MS = 300;

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function username(): string {
    return (getMe()?.username ?? "demo").toLowerCase();
}

export function setBackdrop(frameId: string, checkerId: string, darkId: string, mode: "checker" | "dark"): void {
    const frame = el(frameId);
    frame.classList.toggle("bg-checker", mode === "checker");
    frame.classList.toggle("bg-dark", mode === "dark");
    el(checkerId).classList.toggle("btn-primary", mode === "checker");
    el(darkId).classList.toggle("btn-primary", mode === "dark");
}

export function wireCopy(buttonId: string, getValue: () => string): void {
    el<HTMLButtonElement>(buttonId).addEventListener("click", () => {
        const btn = el<HTMLButtonElement>(buttonId);
        navigator.clipboard.writeText(getValue()).then(() => {
            btn.textContent = "Copied";
            setTimeout(() => { btn.textContent = "Copy"; }, 1200);
        }).catch(() => { btn.textContent = "Failed"; });
    });
}
