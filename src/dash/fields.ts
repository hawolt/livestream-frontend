import { copyText } from "../clipboard.ts";
import { esc, maskSecret } from "./format.ts";

export function fieldRow(label: string, value: string, id: string, secret: boolean): string {
    const shown = secret ? maskSecret(value) : value;
    return `
        <div style="margin-top:8px">
            <label style="font-size:12px;color:var(--muted)">${label}</label>
            <div style="display:flex;gap:6px;align-items:center">
                <code id="${id}" style="font-size:11px;word-break:break-all;flex:1">${esc(shown)}</code>
                ${secret ? `<button class="btn btn-sm" id="${id}-reveal">Reveal</button>` : ""}
                <button class="btn btn-sm" id="${id}-copy">Copy</button>
            </div>
        </div>`;
}

export function wireField(id: string, value: string, secret: boolean): void {
    document.getElementById(`${id}-copy`)?.addEventListener("click", () => {
        const btn = document.getElementById(`${id}-copy`)!;
        void copyText(value).then(copied => {
            btn.textContent = copied ? "Copied" : "Failed";
            setTimeout(() => { btn.textContent = "Copy"; }, 1200);
        });
    });
    if (!secret) return;
    document.getElementById(`${id}-reveal`)?.addEventListener("click", () => {
        const btn = document.getElementById(`${id}-reveal`)!;
        const code = document.getElementById(id)!;
        const hidden = btn.textContent === "Reveal";
        code.textContent = hidden ? value : maskSecret(value);
        btn.textContent = hidden ? "Hide" : "Reveal";
    });
}
