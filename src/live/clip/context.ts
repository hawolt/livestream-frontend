export type ClipPhase = "pinning" | "form" | "submitting" | "processing" | "ready" | "failed" | "blocked";

export interface ClipEditorState {
    open: boolean;
    phase: ClipPhase;
    pin: string | null;
    freezeEdgeSeconds: number;
    selectableStartSeconds: number;
    selectableSpanMs: number;
    startMs: number;
    endMs: number;
    clipId: string | null;
    resultUrl: string | null;
    errorMessage: string;
    pollGeneration: number;
    submitted: boolean;
    jobPhase: string | null;
    jobQueuePosition: number | null;
}

export const clipCtx: ClipEditorState = {
    open: false,
    phase: "pinning",
    pin: null,
    freezeEdgeSeconds: 0,
    selectableStartSeconds: 0,
    selectableSpanMs: 0,
    startMs: 0,
    endMs: 0,
    clipId: null,
    resultUrl: null,
    errorMessage: "",
    pollGeneration: 0,
    submitted: false,
    jobPhase: null,
    jobQueuePosition: null,
};

export function resetClipEditorState(): void {
    clipCtx.phase = "pinning";
    clipCtx.pin = null;
    clipCtx.freezeEdgeSeconds = 0;
    clipCtx.selectableStartSeconds = 0;
    clipCtx.selectableSpanMs = 0;
    clipCtx.startMs = 0;
    clipCtx.endMs = 0;
    clipCtx.clipId = null;
    clipCtx.resultUrl = null;
    clipCtx.errorMessage = "";
    clipCtx.pollGeneration += 1;
    clipCtx.submitted = false;
    clipCtx.jobPhase = null;
    clipCtx.jobQueuePosition = null;
}
