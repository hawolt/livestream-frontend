export type EditorPhase =
    | "checking-session"
    | "invalid-channel"
    | "pinning"
    | "channel-offline"
    | "blocked"
    | "loading-media"
    | "media-error"
    | "ready"
    | "submitting"
    | "processing"
    | "done"
    | "create-failed";

export const MIN_SPAN_MS = 3000;
export const MAX_SPAN_MS = 30000;
export const DEFAULT_SPAN_MS = 15000;
export const TITLE_MAX_LEN = 100;
export const PIN_RENEW_MS = 300000;

export interface EditorState {
    channel: string;
    phase: EditorPhase;
    token: string;
    pin: string | null;
    nowMs: number;
    windowMs: number;
    mediaStartMs: number;
    selectionStartMs: number;
    selectionEndMs: number;
    viewStartMs: number;
    viewEndMs: number;
    playingSelection: boolean;
    clipCode: string | null;
    errorMessage: string;
    jobPhase: string | null;
    jobQueuePosition: number | null;
    submitted: boolean;
}

export const state: EditorState = {
    channel: "",
    phase: "checking-session",
    token: "",
    pin: null,
    nowMs: 0,
    windowMs: 0,
    mediaStartMs: 0,
    selectionStartMs: 0,
    selectionEndMs: 0,
    viewStartMs: 0,
    viewEndMs: 0,
    playingSelection: false,
    clipCode: null,
    errorMessage: "",
    jobPhase: null,
    jobQueuePosition: null,
    submitted: false,
};
