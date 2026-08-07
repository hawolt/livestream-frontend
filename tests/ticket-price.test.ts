import { describe, expect, test } from "bun:test";
import {
    buyButtonLabel, formatTicketPrice, gateHint, parseTicketPrice,
    TICKET_MAX_CENTS, TICKET_MIN_CENTS,
} from "../src/ticket-price.ts";

describe("formatTicketPrice", () => {
    test("renders cents as a currency amount", () => {
        expect(formatTicketPrice(500, "EUR")).toBe("5.00 €");
        expect(formatTicketPrice(1999, "USD")).toBe("19.99 $");
        expect(formatTicketPrice(250, "gbp")).toBe("2.50 £");
    });

    test("falls back to the raw code and to a bare amount", () => {
        expect(formatTicketPrice(500, "CHF")).toBe("5.00 CHF");
        expect(formatTicketPrice(500, null)).toBe("5.00");
        expect(formatTicketPrice(500, "")).toBe("5.00");
    });
});

describe("parseTicketPrice", () => {
    test("accepts plain and decimal amounts", () => {
        expect(parseTicketPrice("5")).toBe(500);
        expect(parseTicketPrice("5.00")).toBe(500);
        expect(parseTicketPrice("19.99")).toBe(1999);
        expect(parseTicketPrice(" 1,50 ")).toBe(150);
    });

    test("enforces the server bounds", () => {
        expect(parseTicketPrice("0.99")).toBeNull();
        expect(parseTicketPrice("1")).toBe(TICKET_MIN_CENTS);
        expect(parseTicketPrice("500")).toBe(TICKET_MAX_CENTS);
        expect(parseTicketPrice("500.01")).toBeNull();
    });

    test("rejects junk", () => {
        expect(parseTicketPrice("")).toBeNull();
        expect(parseTicketPrice("abc")).toBeNull();
        expect(parseTicketPrice("5.999")).toBeNull();
        expect(parseTicketPrice("-5")).toBeNull();
        expect(parseTicketPrice("1e3")).toBeNull();
    });
});

describe("gateHint", () => {
    test("names every way in", () => {
        expect(gateHint({ passwordRequired: true, ticketRequired: false }))
            .toBe("Enter the stream password to watch and chat.");
        expect(gateHint({ passwordRequired: false, ticketRequired: true }))
            .toBe("Buy a ticket to watch and chat.");
        expect(gateHint({ passwordRequired: true, ticketRequired: true }))
            .toBe("Buy a ticket to watch and chat, or unlock with the stream password.");
    });
});

describe("buyButtonLabel", () => {
    test("shows the price when there is one", () => {
        expect(buyButtonLabel(500, "EUR")).toBe("Buy a ticket for 5.00 €");
        expect(buyButtonLabel(null, "EUR")).toBe("Buy a ticket");
        expect(buyButtonLabel(0, "EUR")).toBe("Buy a ticket");
    });
});
