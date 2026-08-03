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
    formEl,
    loadBarFillEl,
    loadLabelEl,
    loadOverlayEl,
    playerControlsEl,
    progressEl,
    progressLabelEl,
    resultCopyEl,
    resultEl,
    resultHeadingEl,
    resultLinkEl,
    resultOpenEl,
    resultPanelEl,
    resultRetryEl,
    resultRowEl,
    resultStatusEl,
    stateEl,
    stateTextEl,
    timelineCardEl,
    titleInputEl,
    volumeEl,
} from "./dom.ts";
import { clipShareUrl, state } from "./context.ts";
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
    const submitting = phase === "submitting";
    const mediaReady = phase !== "loading-media";
    const showForm = phase !== "processing" && phase !== "done" && phase !== "create-failed";
    const showProgress = phase === "processing";
    const showResult = phase === "done" || phase === "create-failed";

    formEl.hidden = !showForm;
    btnCreateEl.disabled = !editable;
    btnCreateEl.textContent = submitting ? "Creating clip..." : "Create clip";
    errorEl.textContent = editable ? state.errorMessage : "";
    progressEl.hidden = !showProgress;
    resultEl.hidden = !showResult;

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

    if (showProgress) {
        progressLabelEl.textContent = clipProcessingMessage(state.jobPhase, state.jobQueuePosition, "Processing your clip...");
    }

    if (phase === "done") {
        const url = clipShareUrl();
        resultPanelEl.classList.add("ce-result-panel-success");
        resultPanelEl.classList.remove("ce-result-panel-error");
        resultHeadingEl.textContent = "Clip ready";
        resultStatusEl.textContent = "Anyone with the link can watch this clip.";
        resultRowEl.hidden = false;
        resultLinkEl.value = url;
        resultOpenEl.href = url || "#";
        resultOpenEl.hidden = !url;
        resultCopyEl.hidden = !url;
        resultRetryEl.hidden = true;
    } else if (phase === "create-failed") {
        resultPanelEl.classList.add("ce-result-panel-error");
        resultPanelEl.classList.remove("ce-result-panel-success");
        resultHeadingEl.textContent = "Clip failed";
        resultStatusEl.textContent = state.errorMessage || "Clip creation failed.";
        resultRowEl.hidden = true;
        resultLinkEl.value = "";
        resultOpenEl.href = "#";
        resultCopyEl.hidden = true;
        resultRetryEl.hidden = false;
    }
}
