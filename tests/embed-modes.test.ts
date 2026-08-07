import { describe, expect, test } from "bun:test";
import { resolveEmbedModes } from "../src/embed/modes.ts";

const modes = (query: string) => resolveEmbedModes(new URLSearchParams(query));

describe("resolveEmbedModes", () => {
    test("a plain embed enables nothing", () => {
        expect(modes("")).toEqual({ preview: false, controls: false, cleanfeed: false });
    });

    test("each mode is enabled by its own flag", () => {
        expect(modes("preview=1").preview).toBe(true);
        expect(modes("controls=1").controls).toBe(true);
        expect(modes("cleanfeed=1").cleanfeed).toBe(true);
    });

    test("only the literal 1 enables a mode", () => {
        expect(modes("controls=0").controls).toBe(false);
        expect(modes("controls=true").controls).toBe(false);
        expect(modes("controls=").controls).toBe(false);
    });

    test("controls wins over cleanfeed", () => {
        const both = modes("controls=1&cleanfeed=1");
        expect(both.controls).toBe(true);
        expect(both.cleanfeed).toBe(false);
    });

    test("preview wins over controls so hover previews stay chromeless", () => {
        const both = modes("preview=1&controls=1");
        expect(both.preview).toBe(true);
        expect(both.controls).toBe(false);
    });

    test("preview and cleanfeed still compose", () => {
        const both = modes("preview=1&cleanfeed=1");
        expect(both.preview).toBe(true);
        expect(both.cleanfeed).toBe(true);
    });
});
