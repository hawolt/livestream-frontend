import { expect, test } from "bun:test";
import { exactTypeaheadMatch, filterTypeaheadOptions, type TypeaheadOption } from "../src/typeahead.ts";

const OPTIONS: TypeaheadOption[] = [
    { value: "", label: "No category" },
    { value: "de", label: "German" },
    { value: "en", label: "English" },
    { value: "fr", label: "French" },
    { value: "sq", label: "Albanian" },
    { value: "lb", label: "Luxembourgish" },
];

test("substring matching is case-insensitive and anywhere in the label", () => {
    expect(filterTypeaheadOptions(OPTIONS, "ger").map((o) => o.label)).toEqual(["German"]);
    expect(filterTypeaheadOptions(OPTIONS, "GER").map((o) => o.label)).toEqual(["German"]);
    expect(filterTypeaheadOptions(OPTIONS, "an").map((o) => o.label)).toEqual(["German", "Albanian"]);
    expect(filterTypeaheadOptions(OPTIONS, "  eng ").map((o) => o.label)).toEqual(["English"]);
});

test("empty query returns everything in order, respecting the limit", () => {
    expect(filterTypeaheadOptions(OPTIONS, "")).toEqual(OPTIONS);
    expect(filterTypeaheadOptions(OPTIONS, "", 2).length).toBe(2);
});

test("no match returns empty", () => {
    expect(filterTypeaheadOptions(OPTIONS, "zzz")).toEqual([]);
});

test("exact match ignores case and surrounding whitespace", () => {
    expect(exactTypeaheadMatch(OPTIONS, " german ")?.value).toBe("de");
    expect(exactTypeaheadMatch(OPTIONS, "germ")).toBeNull();
});
