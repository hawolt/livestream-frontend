export interface InertSiblingState {
    element: HTMLElement;
    inert: boolean;
}

export function inertSiblings(element: HTMLElement): InertSiblingState[] {
    const parent = element.parentElement;
    if (!parent) return [];
    const states: InertSiblingState[] = [];
    for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === element) continue;
        states.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
    }
    return states;
}

export function restoreInertSiblings(states: InertSiblingState[]): void {
    for (const state of states) {
        if (state.element.isConnected) state.element.inert = state.inert;
    }
}
