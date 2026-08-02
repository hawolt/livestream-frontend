import { beforeEach, describe, expect, test } from "bun:test";
import type { Profile } from "../src/profile-card.ts";
import { renderProfileCard } from "../src/profile-card.ts";

class StubElement {
    tagName: string;
    className = "";
    href = "";
    target = "";
    rel = "";
    referrerPolicy = "";
    src = "";
    alt = "";
    loading = "";
    textContent = "";
    title = "";
    style: Record<string, string> = {};
    attrs: Record<string, string> = {};
    children: StubElement[] = [];

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    setAttribute(name: string, value: string): void {
        this.attrs[name] = value;
        if (name === "class") this.className = value;
    }

    appendChild(child: StubElement): StubElement {
        this.children.push(child);
        return child;
    }

    append(...nodes: StubElement[]): void {
        for (const n of nodes) this.appendChild(n);
    }

    replaceChildren(...next: StubElement[]): void {
        this.children = next;
    }

    descendants(): StubElement[] {
        const out: StubElement[] = [];
        for (const child of this.children) {
            out.push(child);
            out.push(...child.descendants());
        }
        return out;
    }

    findTag(tagName: string): StubElement | null {
        return this.descendants().find(el => el.tagName === tagName) ?? null;
    }

    findClass(className: string): StubElement | null {
        return this.descendants().find(el => el.className === className) ?? null;
    }
}

const stubDocument = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    createElementNS(_ns: string, tagName: string): StubElement {
        return new StubElement(tagName);
    },
};

(globalThis as unknown as { document: unknown }).document = stubDocument;

function makeProfile(overrides: Partial<Profile> = {}): Profile {
    return {
        username: "streamer",
        bio: "Hello there",
        links: [{ label: "Twitter", url: "https://example.com/streamer" }],
        followers: 42,
        hasAvatar: true,
        hasBanner: true,
        avatarVersion: 1,
        bannerVersion: 1,
        ...overrides,
    };
}

function render(container: StubElement, profile: Profile | null): void {
    renderProfileCard(container as unknown as HTMLElement, profile);
}

describe("renderProfileCard", () => {
    let container: StubElement;

    beforeEach(() => {
        container = new StubElement("div");
    });

    test("an absent profile renders nothing", () => {
        render(container, null);
        expect(container.children.length).toBe(0);
    });

    test("a profile with no avatar or banner still renders", () => {
        render(container, makeProfile({ hasAvatar: false, hasBanner: false, links: [] }));
        expect(container.children.length).toBeGreaterThan(0);
        expect(container.findClass("profile-card-username")!.textContent).toBe("streamer");
        expect(container.findClass("profile-card-avatar-fallback")).not.toBeNull();
        expect(container.findClass("profile-card-banner")).toBeNull();
    });

    test("a bio containing markup stays inert text", () => {
        const hostile = "<img src=x onerror=alert(1)>";
        render(container, makeProfile({ bio: hostile }));
        const bio = container.findClass("profile-card-bio");
        expect(bio).not.toBeNull();
        expect(bio!.textContent).toBe(hostile);
        expect(container.findTag("img")!.src).not.toBe(hostile);
    });

    test("link anchors carry the right rel and referrer policy, and never show the raw url as text", () => {
        render(container, makeProfile({ links: [{ label: "My site", url: "https://x.com/site", platform: "x" }] }));
        const anchor = container.findClass("profile-card-link");
        expect(anchor).not.toBeNull();
        expect(anchor!.href).toBe("https://x.com/site");
        expect(anchor!.rel).toBe("noopener noreferrer nofollow ugc");
        expect(anchor!.referrerPolicy).toBe("no-referrer");
        expect(anchor!.descendants().map(el => el.textContent).join("")).toBe("My site");
        const icon = anchor!.descendants().find(el => el.tagName === "svg");
        expect(icon).not.toBeUndefined();
        expect(icon!.attrs["viewBox"]).toBe("0 0 24 24");
    });

    test("a non https link is dropped rather than rendered", () => {
        render(container, makeProfile({ links: [{ label: "sketchy", url: "javascript:alert(1)" }] }));
        expect(container.findClass("profile-card-link")).toBeNull();
    });

    test("renders only through createElement, so an innerHTML rewrite would fail this suite", () => {
        render(container, makeProfile());
        expect(container.children.length).toBe(1);
        expect(container.children[0]!.tagName).toBe("div");
    });
});
