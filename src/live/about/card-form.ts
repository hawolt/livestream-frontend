import { isSafeHttpLink } from "./panels.ts";

export type CardType = "text" | "image";

export interface CardFormInput {
    type: CardType;
    body: string;
    linkUrl: string;
    hasFile: boolean;
}

export interface CardFormErrors {
    body?: string;
    file?: string;
    linkUrl?: string;
}

export const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateCardForm(input: CardFormInput): CardFormErrors {
    const errors: CardFormErrors = {};
    const linkUrl = input.linkUrl.trim();
    if (input.type === "text") {
        if (!input.body.trim()) errors.body = "Add a body.";
    } else if (!input.hasFile) {
        errors.file = "Choose an image to upload.";
    }
    if (linkUrl && !isSafeHttpLink(linkUrl)) errors.linkUrl = "Link must start with http:// or https://";
    return errors;
}

export function cardImageError(file: { type: string; size: number }): string | null {
    if (file.type !== "image/jpeg" && file.type !== "image/png") return "Only JPG or PNG images are allowed.";
    if (file.size <= 0) return "That file looks empty. Choose another image.";
    if (file.size > MAX_CARD_IMAGE_BYTES) return "Image is too large. Limit is 8 MiB.";
    return null;
}
