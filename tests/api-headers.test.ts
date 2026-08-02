import { describe, expect, test } from "bun:test";
import { buildRequestHeaders } from "../src/api.ts";

describe("buildRequestHeaders", () => {
    test("defaults Content-Type to application/json with no init headers", () => {
        expect(buildRequestHeaders()).toEqual({ "Content-Type": "application/json" });
    });

    test("keeps the default Content-Type when the caller only sets Authorization", () => {
        const headers = buildRequestHeaders({ "Authorization": "Bearer abc" });
        expect(headers).toEqual({
            "Content-Type": "application/json",
            "Authorization": "Bearer abc",
        });
    });

    test("lets the caller override Content-Type explicitly", () => {
        const headers = buildRequestHeaders({ "Content-Type": "text/plain" });
        expect(headers).toEqual({ "Content-Type": "text/plain" });
    });
});
