const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
};

export const TICKET_MIN_CENTS = 100;
export const TICKET_MAX_CENTS = 50000;

export function formatTicketPrice(cents: number, currency: string | null | undefined): string {
    const amount = (cents / 100).toFixed(2);
    const code = (currency ?? "").trim().toUpperCase();
    const symbol = code ? CURRENCY_SYMBOLS[code] ?? code : "";
    return symbol ? `${amount} ${symbol}` : amount;
}

export function parseTicketPrice(raw: string): number | null {
    const trimmed = raw.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const cents = Math.round(Number(trimmed) * 100);
    if (!Number.isFinite(cents)) return null;
    if (cents < TICKET_MIN_CENTS || cents > TICKET_MAX_CENTS) return null;
    return cents;
}

export interface TicketGateState {
    passwordRequired: boolean;
    ticketRequired: boolean;
}

export function gateHint(state: TicketGateState): string {
    if (state.ticketRequired && state.passwordRequired) {
        return "Buy a ticket to watch and chat, or unlock with the stream password.";
    }
    if (state.ticketRequired) return "Buy a ticket to watch and chat.";
    return "Enter the stream password to watch and chat.";
}

export function buyButtonLabel(cents: number | null | undefined, currency: string | null | undefined): string {
    return typeof cents === "number" && cents > 0
        ? `Buy a ticket for ${formatTicketPrice(cents, currency)}`
        : "Buy a ticket";
}
