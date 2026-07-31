export interface QuotaTrimState {
    keepS: number;
    failStreak: number;
}

export function quotaTrimOnFailure(state: QuotaTrimState, floorS: number): QuotaTrimState {
    const failStreak = state.failStreak + 1;
    const keepS = failStreak > 1 ? Math.max(floorS, state.keepS / 2) : state.keepS;
    return { keepS, failStreak };
}

export function quotaTrimOnCleanAppend(restoreS: number): QuotaTrimState {
    return { keepS: restoreS, failStreak: 0 };
}
