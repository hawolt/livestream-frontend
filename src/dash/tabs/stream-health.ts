import type { LiveInfo } from "../../api.ts";
import { authFetch } from "../session.ts";

let shActivation = 0;

function clearIframe(): void {
    shActivation += 1;
    const container = document.getElementById("sh-container");
    if (container) container.innerHTML = "";
}

function showNoData(): void {
    const noData = document.getElementById("sh-no-data");
    const container = document.getElementById("sh-container");
    if (noData) noData.style.display = "";
    if (container) container.style.display = "none";
}

async function initStreamHealthTab(activation: number): Promise<void> {
    const noData    = document.getElementById("sh-no-data")!;
    const container = document.getElementById("sh-container")!;
    try {
        const live = await authFetch<LiveInfo>("/api/live");
        if (activation !== shActivation) return;
        if (!live.keyHash) { showNoData(); return; }
        noData.style.display = "none";
        container.style.display = "";
        container.innerHTML = `<div id="sh-loading" style="padding:40px 0;text-align:center;color:var(--muted)">Loading&hellip;</div>`;
        const iframe = document.createElement("iframe");
        iframe.id = "sh-iframe";
        iframe.title = "Stream health telemetry";
        iframe.style.width = "100%";
        iframe.style.height = "calc(100dvh - 52px - 40px)";
        iframe.style.border = "0";
        iframe.style.borderRadius = "var(--radius)";
        iframe.style.display = "none";
        iframe.addEventListener("load", () => {
            if (activation !== shActivation) return;
            document.getElementById("sh-loading")?.remove();
            iframe.style.display = "";
        }, { once: true });
        iframe.src = `/details#k=${encodeURIComponent(live.keyHash)}&n=${encodeURIComponent(live.username)}&viewerEgress=1`;
        container.appendChild(iframe);
    } catch {
        if (activation === shActivation) showNoData();
    }
}

export function init(): void {
}

export function activate(): void {
    clearIframe();
    void initStreamHealthTab(shActivation);
}

export function deactivate(): void {
    clearIframe();
}
