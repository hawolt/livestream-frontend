export const CHAT_AD_PACING = {
    minMessagesSinceLastAd: 20,
    minMsSinceLastAd: 15 * 60_000,
};

export interface ChatAdState {
    messagesSinceAd: number;
    lastAdAt: number;
    dismissed: boolean;
    inFlight: boolean;
}

export function chatAdDue(state: ChatAdState, now: number): boolean {
    if (state.dismissed || state.inFlight) return false;
    if (state.lastAdAt === 0) return false;
    if (state.messagesSinceAd < CHAT_AD_PACING.minMessagesSinceLastAd) return false;
    return now - state.lastAdAt >= CHAT_AD_PACING.minMsSinceLastAd;
}
