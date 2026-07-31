export type ChaseDecision = "snap" | "chase-rate" | "normal-rate" | "hold" | "guard-snap" | "none";

export interface ChaseInput {
    behindLive: boolean;
    edge: number;
    currentTime: number;
    bufferedStart: number;
    seekGapS: number;
    chaseGapS: number;
    chaseStopS: number;
    guardOffsetS: number;
}

export function decideChase(input: ChaseInput): ChaseDecision {
    if (!input.behindLive) {
        const gap = input.edge - input.currentTime;
        if (gap > input.seekGapS) return "snap";
        if (gap > input.chaseGapS) return "chase-rate";
        if (gap < input.chaseStopS) return "normal-rate";
        return "hold";
    }
    const guard = input.bufferedStart + input.guardOffsetS;
    return input.currentTime < guard ? "guard-snap" : "none";
}
