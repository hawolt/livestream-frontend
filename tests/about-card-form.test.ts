import { expect, test } from "bun:test";
import { cardImageError, validateCardForm } from "../src/live/about/card-form.ts";

test("text card requires a body", () => {
    expect(validateCardForm({ type: "text", body: "", linkUrl: "", hasFile: false })).toEqual({ body: "Add a body." });
    expect(validateCardForm({ type: "text", body: "  ", linkUrl: "", hasFile: false })).toEqual({ body: "Add a body." });
});

test("text card with a body is valid", () => {
    expect(validateCardForm({ type: "text", body: "Streaming weekdays", linkUrl: "", hasFile: false })).toEqual({});
});

test("image card requires a file", () => {
    expect(validateCardForm({ type: "image", body: "", linkUrl: "", hasFile: false })).toEqual({ file: "Choose an image to upload." });
});

test("image card with a file and no link is valid", () => {
    expect(validateCardForm({ type: "image", body: "", linkUrl: "", hasFile: true })).toEqual({});
});

test("image card rejects an unsafe link", () => {
    const errors = validateCardForm({ type: "image", body: "", linkUrl: "javascript:alert(1)", hasFile: true });
    expect(errors.linkUrl).toBe("Link must start with http:// or https://");
});

test("image card accepts a valid https link", () => {
    expect(validateCardForm({ type: "image", body: "", linkUrl: "https://example.com", hasFile: true })).toEqual({});
});

test("cardImageError rejects non jpg/png types", () => {
    expect(cardImageError({ type: "image/gif", size: 1024 })).toBe("Only JPG or PNG images are allowed.");
});

test("cardImageError rejects empty files", () => {
    expect(cardImageError({ type: "image/png", size: 0 })).toBe("That file looks empty. Choose another image.");
});

test("cardImageError rejects oversized files", () => {
    expect(cardImageError({ type: "image/jpeg", size: 9 * 1024 * 1024 })).toBe("Image is too large. Limit is 8 MiB.");
});

test("cardImageError accepts a valid jpg", () => {
    expect(cardImageError({ type: "image/jpeg", size: 1024 })).toBeNull();
});

test("cardImageError accepts a valid png", () => {
    expect(cardImageError({ type: "image/png", size: 1024 })).toBeNull();
});
