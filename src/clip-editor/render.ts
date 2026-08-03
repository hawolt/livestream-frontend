import {
    bodyEl,
    btnCreateEl,
    channelSuffixEl,
    errorEl,
    loadBarFillEl,
    loadLabelEl,
    loadOverlayEl,
    progressEl,
    progressLabelEl,
    resultCopyEl,
    resultEl,
    resultLinkEl,
    resultStatusEl,
    stateEl,
} from "./dom.ts";
import { state } from "./context.ts";
import { clipProcessingMessage } from "../clip-processing-message.ts";

export function setChannelLabel(channel: string): void {
    channelSuffixEl.textContent = channel ? ` for ${channel}` : "";
}

export function showStateMessage(text: string): void {
    stateEl.hidden = false;
    stateEl.textContent = text;
    bodyEl.hidden = true;
}

export function showBody(): void {
    stateEl.hidden = true;
    bodyEl.hidden = false;
}

export function setLoadProgress(fraction: number, visible: boolean): void {
    loadOverlayEl.hidden = !visible;
    if (!visible) return;
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    loadBarFillEl.style.width = `${pct}%`;
    loadLabelEl.textContent = `Loading clip window... ${pct}%`;
}

export function render(): void {
    const phase = state.phase;
    btnCreateEl.disabled = phase !== "ready";
    errorEl.textContent = phase === "ready" ? state.errorMessage : "";
    progressEl.hidden = phase !== "submitting" && phase !== "processing";
    resultEl.hidden = phase !== "done" && phase !== "create-failed";

    if (phase === "submitting") {
        progressLabelEl.textContent = "Submitting clip...";
    } else if (phase === "processing") {
        progressLabelEl.textContent = clipProcessingMessage(state.jobPhase, state.jobQueuePosition, "Processing your clip...");
    }

    if (phase === "done") {
        const url = state.clipCode ? `/${state.channel}/clip/${state.clipCode}` : "";
        resultStatusEl.textContent = "Clip ready.";
        resultLinkEl.href = url || "#";
        resultLinkEl.textContent = url ? `${location.origin}${url}` : "";
        resultCopyEl.hidden = !url;
    } else if (phase === "create-failed") {
        resultStatusEl.textContent = state.errorMessage || "Clip creation failed.";
        resultLinkEl.href = "#";
        resultLinkEl.textContent = "";
        resultCopyEl.hidden = true;
    }
}
