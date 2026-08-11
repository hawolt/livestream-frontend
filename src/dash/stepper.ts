export function stepperStep(step: string): number {
    const v = Number(step);
    return Number.isFinite(v) && v > 0 ? v : 1;
}

export function stepperBound(raw: string): number | null {
    if (raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
}

export function stepperNext(current: string, dir: number, min: string, max: string, step: string): string {
    const s = stepperStep(step);
    const lo = stepperBound(min);
    const hi = stepperBound(max);
    const cur = Number(current);
    let next: number;
    if (current !== "" && Number.isFinite(cur)) {
        next = cur + dir * s;
    } else if (lo !== null) {
        next = lo;
    } else {
        next = dir * s;
    }
    if (lo !== null && next < lo) next = lo;
    if (hi !== null && next > hi) next = hi;
    const decimals = (String(s).split(".")[1] ?? "").length;
    return decimals > 0 ? next.toFixed(decimals) : String(Math.round(next));
}

export function stepperAtBound(current: string, dir: number, min: string, max: string): boolean {
    const cur = Number(current);
    if (current === "" || !Number.isFinite(cur)) return false;
    const lo = stepperBound(min);
    const hi = stepperBound(max);
    if (dir < 0) return lo !== null && cur <= lo;
    return hi !== null && cur >= hi;
}

export function wireStepper(input: HTMLInputElement): void {
    let wrap = input.closest<HTMLElement>(".stepper");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "stepper";
        if (input.style.width) {
            wrap.style.width = input.style.width;
            input.style.width = "";
        }
        input.insertAdjacentElement("beforebegin", wrap);
        const minus = document.createElement("button");
        minus.type = "button";
        minus.className = "stepper-btn";
        minus.dataset["step"] = "-1";
        minus.setAttribute("aria-label", "Decrease");
        minus.textContent = "−";
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "stepper-btn";
        plus.dataset["step"] = "1";
        plus.setAttribute("aria-label", "Increase");
        plus.textContent = "+";
        wrap.appendChild(minus);
        wrap.appendChild(input);
        wrap.appendChild(plus);
    }
    if (wrap.dataset["stepperWired"] === "1") return;
    wrap.dataset["stepperWired"] = "1";
    const buttons = Array.from(wrap.querySelectorAll<HTMLButtonElement>(".stepper-btn"));
    const sync = () => {
        for (const btn of buttons) {
            const dir = Number(btn.dataset["step"]) || 0;
            btn.disabled = input.disabled || stepperAtBound(input.value, dir, input.min, input.max);
        }
    };
    for (const btn of buttons) {
        btn.addEventListener("click", () => {
            if (input.disabled) return;
            const dir = Number(btn.dataset["step"]) || 0;
            if (!dir) return;
            input.value = stepperNext(input.value, dir, input.min, input.max, input.step);
            sync();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }
    input.addEventListener("input", sync);
    sync();
}
