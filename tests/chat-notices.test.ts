import { beforeEach, describe, expect, test } from "bun:test";
import { removeNotice, showNotice } from "../src/chat/notices.ts";

class StubElement {
    tagName: string;
    className = "";
    textContent = "";
    hidden = false;
    isConnected = false;
    parent: StubElement | null = null;
    children: StubElement[] = [];

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    get childElementCount(): number {
        return this.children.length;
    }

    appendChild(child: StubElement): StubElement {
        this.children.push(child);
        child.parent = this;
        child.isConnected = true;
        return child;
    }

    replaceChildren(...next: StubElement[]): void {
        for (const child of this.children) {
            child.parent = null;
            child.isConnected = false;
        }
        this.children = next;
        for (const child of next) {
            child.parent = this;
            child.isConnected = true;
        }
    }

    remove(): void {
        const parent = this.parent;
        if (parent) {
            parent.children = parent.children.filter(child => child !== this);
        }
        this.parent = null;
        this.isConnected = false;
    }
}

let host: StubElement;

function build(root: unknown): void {
    const el = root as StubElement;
    const span = new StubElement("span");
    span.textContent = "hello";
    el.appendChild(span);
}

beforeEach(() => {
    host = new StubElement("div");
    host.hidden = true;
    const stubDocument = {
        getElementById(id: string): StubElement | null {
            return id === "live-chat-notices" ? host : null;
        },
        createElement(tagName: string): StubElement {
            return new StubElement(tagName);
        },
    };
    (globalThis as unknown as { document: unknown }).document = stubDocument;
    (globalThis as unknown as { window: unknown }).window = { setTimeout, clearTimeout };
    removeNotice("raid");
    removeNotice("points");
});

describe("showNotice", () => {
    test("creates one row and unhides the host", () => {
        showNotice("raid", build);
        expect(host.hidden).toBe(false);
        expect(host.childElementCount).toBe(1);
        const row = host.children[0] as StubElement;
        expect(row.className).toBe("live-chat-pin live-chat-notice");
        expect(row.childElementCount).toBe(1);
    });

    test("replaces the content of an existing id in place", () => {
        showNotice("raid", build);
        let calls = 0;
        showNotice("raid", root => {
            calls++;
            build(root);
        });
        expect(calls).toBe(1);
        expect(host.childElementCount).toBe(1);
        expect((host.children[0] as StubElement).childElementCount).toBe(1);
    });

    test("keeps separate rows per id", () => {
        showNotice("raid", build);
        showNotice("points", build);
        expect(host.childElementCount).toBe(2);
    });

    test("ignores an invalid id", () => {
        showNotice("Bad Id!", build);
        expect(host.childElementCount).toBe(0);
        expect(host.hidden).toBe(true);
    });
});

describe("removeNotice", () => {
    test("removes the row and rehides the empty host", () => {
        showNotice("raid", build);
        removeNotice("raid");
        expect(host.childElementCount).toBe(0);
        expect(host.hidden).toBe(true);
    });

    test("is a no-op for an unknown id", () => {
        showNotice("raid", build);
        removeNotice("points");
        expect(host.childElementCount).toBe(1);
        expect(host.hidden).toBe(false);
    });
});

describe("notice ttl", () => {
    test("auto removes after the ttl elapses", async () => {
        showNotice("raid", build, { ttlMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(host.childElementCount).toBe(0);
        expect(host.hidden).toBe(true);
    });

    test("reshowing the same id resets the ttl", async () => {
        showNotice("raid", build, { ttlMs: 50 });
        await new Promise(resolve => setTimeout(resolve, 30));
        showNotice("raid", build, { ttlMs: 50 });
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(host.childElementCount).toBe(1);
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(host.childElementCount).toBe(0);
        expect(host.hidden).toBe(true);
    });
});
