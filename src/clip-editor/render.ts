import {
    bodyEl,
    btnCreateEl,
    btnMuteEl,
    btnPlayPauseEl,
    btnPlaySelectionEl,
    btnSetInEl,
    btnSetOutEl,
    btnZoomResetEl,
    channelNameEl,
    errorEl,
    loadBarFillEl,
    loadLabelEl,
    loadOverlayEl,
    playerControlsEl,
    progressEl,
    progressLabelEl,
    resultCopyEl,
    resultEl,
    resultLinkEl,
    resultStatusEl,
    stateEl,
    stateTextEl,
    timelineCardEl,
    titleInputEl,
    volumeEl,
} from "./dom.ts";
import { state } from "./context.ts";
import { clipProcessingMessage } from "../clip-processing-message.ts";

export function setChannelLabel(channel: string): void {
    channelNameEl.textContent = channel;
}

export function showStateMessage(text: string, loading = true): void {
    stateEl.hidden = false;
    stateTextEl.textContent = text;
    stateEl.classList.toggle("ce-state-loading", loading);
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
    const editable = phase === "ready";
    const mediaReady = phase !== "loading-media";

    btnCreateEl.disabled = !editable;
    errorEl.textContent = editable ? state.errorMessage : "";
    progressEl.hidden = phase !== "submitting" && phase !== "processing";
    resultEl.hidden = phase !== "done" && phase !== "create-failed";

    timelineCardEl.classList.toggle("ce-disabled", !editable);
    btnSetInEl.disabled = !editable;
    btnSetOutEl.disabled = !editable;
    btnPlaySelectionEl.disabled = !editable;
    titleInputEl.disabled = !editable;
    if (!editable) btnZoomResetEl.disabled = true;

    playerControlsEl.classList.toggle("ce-disabled", !mediaReady);
    btnPlayPauseEl.disabled = !mediaReady;
    btnMuteEl.disabled = !mediaReady;
    volumeEl.disabled = !mediaReady;

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
