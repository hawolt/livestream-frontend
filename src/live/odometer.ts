type CounterState = {
    text: string;
    settle: () => void;
};

const counters = new WeakMap<HTMLElement, CounterState>();
const pending = new Set<() => void>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function settlePending(): void {
    for (const settle of pending) settle();
}

reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) settlePending();
});
document.addEventListener("visibilitychange", () => {
    if (document.hidden) settlePending();
});

export function clearOdometer(el: HTMLElement): void {
    counters.get(el)?.settle();
    counters.delete(el);
    el.replaceChildren();
}

export function renderOdometer(el: HTMLElement, value: number): void {
    const text = String(value);
    const previous = counters.get(el);
    if (previous?.text === text) return;
    previous?.settle();
    el.textContent = text;

    const animations: Animation[] = [];
    const state: CounterState = {
        text,
        settle: () => {
            pending.delete(state.settle);
            for (const animation of animations) animation.cancel();
            if (counters.get(el) === state) el.textContent = text;
        },
    };
    counters.set(el, state);

    if (!previous || reducedMotion.matches
            || document.hidden || !el.getClientRects().length || typeof el.animate !== "function") return;

    const length = Math.max(previous.text.length, text.length);
    const before = previous.text.padStart(length, " ");
    const after = text.padStart(length, " ");
    const direction = value > Number(previous.text) ? 1 : -1;
    const timing = { duration: 350, easing: "cubic-bezier(.25, .7, .3, 1)" };
    const places = Array.from(after, (char, index) => {
        const place = document.createElement("span");
        place.className = "odo-place";
        const digit = document.createElement("span");
        digit.className = "odo-digit";
        digit.textContent = char.trim();
        place.appendChild(digit);
        if (char === " ") place.style.width = "0";
        return { place, digit, char, old: before[index] };
    });
    el.replaceChildren(...places.map(({ place }) => place));
    for (const { place, digit, char, old } of places) {
        if (char === old) continue;
        if (char !== " ") {
            animations.push(digit.animate([
                { top: `${direction * 100}%` },
                { top: "0%" },
            ], timing));
        }
        if (old !== " ") {
            const outgoing = document.createElement("span");
            outgoing.className = "odo-digit odo-outgoing";
            outgoing.textContent = old;
            outgoing.setAttribute("aria-hidden", "true");
            place.appendChild(outgoing);
            animations.push(outgoing.animate([
                { top: "0%" },
                { top: `${-direction * 100}%` },
            ], { ...timing, fill: "forwards" }));
        }
        if (old === " " || char === " ") {
            animations.push(place.animate([
                { width: old === " " ? "0" : "1ch" },
                { width: char === " " ? "0" : "1ch" },
            ], timing));
        }
    }
    pending.add(state.settle);
    void Promise.all(animations.map(animation => animation.finished)).then(state.settle, state.settle);
}
