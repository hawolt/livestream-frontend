export type PrewarmPhase = "idle" | "pending" | "ready" | "dead";

export interface PrewarmStartConditions {
    transportKind: string;
    mediaSourceSupported: boolean;
    terminal: boolean;
    target: string;
    currentUsername: string;
}

export function canStartPrewarm(c: PrewarmStartConditions): boolean {
    return c.transportKind === "ws"
        && c.mediaSourceSupported
        && !c.terminal
        && c.target !== ""
        && c.target !== c.currentUsername;
}

export type JoinAction = "swap" | "navigate";

export function joinAction(phase: PrewarmPhase, sessionTarget: string, target: string): JoinAction {
    return phase === "ready" && target !== "" && sessionTarget === target ? "swap" : "navigate";
}
