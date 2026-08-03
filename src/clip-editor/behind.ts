export interface BehindSpan {
    startBehindMs: number;
    endBehindMs: number;
}

export function behindMsFromSelection(nowMs: number, selectionStartMs: number, selectionEndMs: number): BehindSpan {
    return {
        startBehindMs: Math.round(nowMs - selectionStartMs),
        endBehindMs: Math.round(nowMs - selectionEndMs),
    };
}
