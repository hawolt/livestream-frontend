export const CHAT_AD_PACING = {
    minMessagesSinceLastAd: 20,
    minMsSinceLastAd: 15 * 60_000,
    dismissSuppressionMs: 30 * 60_000,
    armingMs: 600,
};

export interface ChatAdState {
    messagesSinceAd: number;
    lastAdAt: number;
    dismissedUntil: number;
    inFlight: boolean;
}

export function chatAdDue(state: ChatAdState, now: number, pinnedToLive: boolean): boolean {
    if (state.inFlight || !pinnedToLive) return false;
    if (now < state.dismissedUntil) return false;
    if (state.lastAdAt === 0) return false;
    if (state.messagesSinceAd < CHAT_AD_PACING.minMessagesSinceLastAd) return false;
    return now - state.lastAdAt >= CHAT_AD_PACING.minMsSinceLastAd;
}

export function chatAdDismissedUntil(now: number): number {
    return now + CHAT_AD_PACING.dismissSuppressionMs;
}

export function chatAdClickArmed(insertedAt: number, now: number): boolean {
    return now - insertedAt >= CHAT_AD_PACING.armingMs;
}
