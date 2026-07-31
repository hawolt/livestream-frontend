export const fmtDate = (s: string | null | undefined): string => {
    if (!s) return "-";
    const raw = s.slice(0, 10);
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
};
export const fmtTime = (s: string | null | undefined): string => {
    if (!s) return "-";
    return s.slice(11, 16);
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
            navigator.clipboard.writeText(value).then(() => {
                btn.textContent = "Copied";
                setTimeout(() => { btn.textContent = "Copy"; }, 1200);
            }).catch(() => { btn.textContent = "Failed"; });
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
