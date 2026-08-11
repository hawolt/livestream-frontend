export interface PrewarmProgress {
    initAppended: boolean;
    fragmentsAppended: number;
    bufferedSeconds: number;
    readyState: number;
}

export function prewarmReady(p: PrewarmProgress): boolean {
    return p.initAppended && p.fragmentsAppended >= 1 && p.bufferedSeconds > 0 && p.readyState >= 2;
}
