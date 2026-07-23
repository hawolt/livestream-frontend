import type { LiveInfo } from "../../api.ts";
import { authFetch } from "../core.ts";

let ssIframe: HTMLIFrameElement | null = null;

function clearIframe(): void {
    const container = document.getElementById("ss-container");
    if (container) container.innerHTML = "";
    ssIframe = null;
}

function showNoData(): void {
    const noData = document.getElementById("ss-no-data");
    const container = document.getElementById("ss-container");
    if (noData) noData.style.display = "";
    if (container) container.style.display = "none";
}

async function initStreamSummaryTab(): Promise<void> {
    const noData    = document.getElementById("ss-no-data")!;
    const container = document.getElementById("ss-container")!;
    clearIframe();
    try {
        const live = await authFetch<LiveInfo>("/api/live");
        if (!live.keyHash) { showNoData(); return; }
        noData.style.display = "none";
        container.style.display = "";
        container.innerHTML = `<div id="ss-loading" style="padding:40px 0;text-align:center;color:var(--muted)">Loading&hellip;</div>`;
        const iframe = document.createElement("iframe");
        iframe.id = "ss-iframe";
        iframe.style.width = "100%";
        iframe.style.height = "calc(100dvh - 52px - 40px)";
        iframe.style.border = "0";
        iframe.style.borderRadius = "var(--radius)";
        iframe.style.display = "none";
        iframe.addEventListener("load", () => {
            document.getElementById("ss-loading")?.remove();
            iframe.style.display = "";
        }, { once: true });
        iframe.src = `/details#k=${encodeURIComponent(live.keyHash)}&n=${encodeURIComponent(live.username)}&charts=viewers`;
        container.appendChild(iframe);
        ssIframe = iframe;
    } catch {
        showNoData();
    }
}

export function init(): void {
}

export function activate(): void {
    clearIframe();
    void initStreamSummaryTab();
}

export function deactivate(): void {
    clearIframe();
}
