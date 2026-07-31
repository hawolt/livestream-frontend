import type { LiveInfo } from "../../api.ts";
import { authFetch } from "../session.ts";

let ssActivation = 0;

function clearIframe(): void {
    ssActivation += 1;
    const container = document.getElementById("ss-container");
    if (container) container.innerHTML = "";
}

function showNoData(): void {
    const noData = document.getElementById("ss-no-data");
    const container = document.getElementById("ss-container");
    if (noData) noData.style.display = "";
    if (container) container.style.display = "none";
}

async function initStreamSummaryTab(activation: number): Promise<void> {
    const noData    = document.getElementById("ss-no-data")!;
    const container = document.getElementById("ss-container")!;
    try {
        const live = await authFetch<LiveInfo>("/api/live");
        if (activation !== ssActivation) return;
        if (!live.keyHash) { showNoData(); return; }
        noData.style.display = "none";
        container.style.display = "";
        container.innerHTML = `<div id="ss-loading" style="padding:40px 0;text-align:center;color:var(--muted)">Loading&hellip;</div>`;
        const iframe = document.createElement("iframe");
        iframe.id = "ss-iframe";
        iframe.title = "Stream summary telemetry";
        iframe.style.width = "100%";
        iframe.style.height = "calc(100dvh - 52px - 40px)";
        iframe.style.border = "0";
        iframe.style.borderRadius = "var(--radius)";
        iframe.style.display = "none";
        iframe.addEventListener("load", () => {
            if (activation !== ssActivation) return;
            document.getElementById("ss-loading")?.remove();
            iframe.style.display = "";
        }, { once: true });
        iframe.src = `/details#k=${encodeURIComponent(live.keyHash)}&n=${encodeURIComponent(live.username)}&charts=viewers`;
        container.appendChild(iframe);
    } catch {
        if (activation === ssActivation) showNoData();
    }
}

export function init(): void {
}

export function activate(): void {
    clearIframe();
    void initStreamSummaryTab(ssActivation);
}

export function deactivate(): void {
    clearIframe();
}
