import { copyText } from "../clipboard.ts";

export const fmtDate = (d: Date | null | undefined): string => {
    if (!d) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
};
export const fmtTime = (d: Date | null | undefined): string => {
    if (!d) return "-";
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
};
export const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/`/g,"&#96;");

export function fmtUptime(s: number): string {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function maskSecret(value: string): string {
    return value ? "•".repeat(16) : "";
}

export function wireCopyButtons(values: string[]): void {
    document.querySelectorAll<HTMLButtonElement>("#modal-body [data-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
            const value = values[Number(btn.dataset["copy"] ?? "-1")] ?? "";
            void copyText(value).then(copied => {
                btn.textContent = copied ? "Copied" : "Failed";
                setTimeout(() => { btn.textContent = "Copy"; }, 1200);
            });
        });
    });
}

export function wireRevealButtons(values: string[]): void {
    document.querySelectorAll<HTMLButtonElement>("#modal-body [data-reveal]").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = Number(btn.dataset["reveal"] ?? "-1");
            const code = document.querySelector<HTMLElement>(`#modal-body [data-secret="${idx}"]`);
            if (!code) return;
            const hidden = btn.textContent === "Reveal";
            code.textContent = hidden ? (values[idx] ?? "") : maskSecret(values[idx] ?? "");
            btn.textContent = hidden ? "Hide" : "Reveal";
        });
    });
}
