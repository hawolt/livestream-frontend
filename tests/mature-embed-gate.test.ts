import { afterEach, beforeEach, describe, expect, test } from "bun:test";

type Listener = () => void;

class StubElement {
    tagName: string;
    textContent = "";
    type = "";
    href = "";
    target = "";
    rel = "";
    removed = false;
    focused = false;
    style = { cssText: "" };
    children: StubElement[] = [];
    listeners = new Map<string, Listener[]>();

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    append(...nodes: StubElement[]): void {
        this.children.push(...nodes);
    }

    appendChild(node: StubElement): void {
        this.children.push(node);
    }

    addEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    focus(): void {
        this.focused = true;
    }

    remove(): void {
        this.removed = true;
    }

    click(): void {
        for (const fn of this.listeners.get("click") ?? []) fn();
    }

    descendants(): StubElement[] {
        const out: StubElement[] = [];
        for (const child of this.children) {
            out.push(child);
            out.push(...child.descendants());
        }
        return out;
    }

    byTag(tagName: string): StubElement | null {
        return this.descendants().find((el) => el.tagName === tagName) ?? null;
    }
}

const stubDocument = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    cookie: "",
};

const stubStorage = {
    getItem(): string | null {
        return null;
    },
    setItem(): void {},
    removeItem(): void {},
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
    for (const key of ["document", "localStorage", "sessionStorage"]) saved[key] = globals[key];
    globals["document"] = stubDocument;
    globals["localStorage"] = stubStorage;
    globals["sessionStorage"] = stubStorage;
});

afterEach(() => {
    for (const key of ["document", "localStorage", "sessionStorage"]) globals[key] = saved[key];
});

const { promptEmbedMatureGate } = await import("../src/player-shared/mature-gate.ts");

function mount(): { host: StubElement; shade: StubElement; pending: Promise<boolean> } {
    const host = new StubElement("div");
    const pending = promptEmbedMatureGate(host as unknown as HTMLElement, "streamer");
    const shade = host.children[0]!;
    return { host, shade, pending };
}

describe("embed mature interstitial", () => {
    test("covers the player until the viewer answers", () => {
        const { host, shade } = mount();
        expect(host.children.length).toBe(1);
        expect(shade.byTag("button")?.textContent).toBe("I am 18 or older");
        expect(shade.descendants().some((el) => el.textContent.includes("streamer"))).toBe(true);
    });

    test("focuses the confirm control so a keyboard viewer can answer", () => {
        const { shade } = mount();
        expect(shade.byTag("button")?.focused).toBe(true);
    });

    test("confirming resolves true and removes the shade", async () => {
        const { shade, pending } = mount();
        shade.byTag("button")!.click();
        expect(await pending).toBe(true);
        expect(shade.removed).toBe(true);
    });

    test("leaving resolves false and removes the shade", async () => {
        const { shade, pending } = mount();
        shade.byTag("a")!.click();
        expect(await pending).toBe(false);
        expect(shade.removed).toBe(true);
    });
});
