import { describe, expect, test } from "bun:test";
import { renderBody } from "../src/chat/render.ts";

class StubText {
    text: string;
    constructor(text: string) {
        this.text = text;
    }
}

class StubElement {
    tagName: string;
    className = "";
    href = "";
    target = "";
    rel = "";
    referrerPolicy = "";
    textContent = "";
    children: (StubElement | StubText)[] = [];

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    appendChild(child: StubElement | StubText): StubElement | StubText {
        if (child instanceof StubElement && child.tagName === "#fragment") {
            this.children.push(...child.children);
            child.children = [];
        } else {
            this.children.push(child);
        }
        return child;
    }

    append(...nodes: (StubElement | StubText)[]): void {
        for (const node of nodes) this.appendChild(node);
    }
}

const stubDocument = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    createTextNode(text: string): StubText {
        return new StubText(text);
    },
    createDocumentFragment(): StubElement {
        return new StubElement("#fragment");
    },
};

(globalThis as unknown as { document: unknown }).document = stubDocument;

type FlatNode = { type: string; text: string; href?: string; rel?: string; target?: string; referrerPolicy?: string };

function flatten(text: string): FlatNode[] {
    const frag = renderBody(text) as unknown as StubElement;
    return frag.children.map((child) => {
        if (child instanceof StubText) return { type: "text", text: child.text };
        return {
            type: child.tagName,
            text: child.textContent,
            href: child.href,
            rel: child.rel,
            target: child.target,
            referrerPolicy: child.referrerPolicy,
        };
    });
}

function joinedText(text: string): string {
    return flatten(text).map((node) => node.text).join("");
}

describe("renderBody link tokenizer", () => {
    test("turns bare http and https links into anchors while preserving surrounding text", () => {
        const text = "check https://example.com/path?a=1 out and also http://foo.bar/x now";
        const nodes = flatten(text);
        const anchors = nodes.filter((n) => n.type === "a");
        expect(anchors).toEqual([
            {
                type: "a",
                text: "https://example.com/path?a=1",
                href: "https://example.com/path?a=1",
                rel: "noopener noreferrer nofollow ugc",
                target: "_blank",
                referrerPolicy: "no-referrer",
            },
            {
                type: "a",
                text: "http://foo.bar/x",
                href: "http://foo.bar/x",
                rel: "noopener noreferrer nofollow ugc",
                target: "_blank",
                referrerPolicy: "no-referrer",
            },
        ]);
        expect(nodes.every((n) => n.type === "a" || n.type === "text")).toBe(true);
        expect(joinedText(text)).toBe(text);
    });

    test("keeps trailing punctuation outside the link as plain text", () => {
        const text = "see https://example.com/x.";
        const nodes = flatten(text);
        const anchor = nodes.find((n) => n.type === "a");
        expect(anchor).toEqual({
            type: "a",
            text: "https://example.com/x",
            href: "https://example.com/x",
            rel: "noopener noreferrer nofollow ugc",
            target: "_blank",
            referrerPolicy: "no-referrer",
        });
        expect(joinedText(text)).toBe(text);
    });

    test("does not linkify javascript, data or vbscript URLs", () => {
        for (const hostile of [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox(1)",
            "JAVASCRIPT:alert(1)",
        ]) {
            const nodes = flatten(`click ${hostile} now`);
            expect(nodes.some((n) => n.type === "a")).toBe(false);
            expect(joinedText(`click ${hostile} now`)).toBe(`click ${hostile} now`);
        }
    });

    test("does not linkify protocol-relative or bare scheme-less hosts", () => {
        const nodes = flatten("go to //evil.example/path or example.com/path");
        expect(nodes.some((n) => n.type === "a")).toBe(false);
    });

    test("does not linkify file and mailto schemes", () => {
        const nodes = flatten("open file:///etc/passwd or mail mailto:a@b.com");
        expect(nodes.some((n) => n.type === "a")).toBe(false);
    });

    test("markup metacharacters in the message stay inert text, never a real element", () => {
        const hostile = 'hi <img src=x onerror=alert(1)> "quoted" & <b>bold</b>';
        const nodes = flatten(hostile);
        expect(nodes.every((n) => n.type === "text")).toBe(true);
        expect(joinedText(hostile)).toBe(hostile);
    });

    test("a link with embedded markup characters carries them as inert href/text, never as parsed markup", () => {
        const hostile = 'https://example.com/x"><script>alert(1)</script>';
        const nodes = flatten(hostile);
        expect(nodes).toEqual([
            {
                type: "a",
                text: hostile,
                href: hostile,
                rel: "noopener noreferrer nofollow ugc",
                target: "_blank",
                referrerPolicy: "no-referrer",
            },
        ]);
    });

    test("preserves whitespace runs exactly between tokens", () => {
        expect(joinedText("a\t\thttps://example.com   b")).toBe("a\t\thttps://example.com   b");
    });
});
