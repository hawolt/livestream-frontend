import { readdir } from "node:fs/promises";

export async function builtName(directory: string, entry: string): Promise<string> {
    const files = await readdir(directory);
    const matches = files.filter(name => name.startsWith(`${entry}-`) && name.endsWith(".js")
        && !name.slice(entry.length + 1, -3).includes("-"));
    if (matches.length !== 1) {
        throw new Error(`expected exactly one built file for ${entry}, found ${matches.length}: ${matches.join(", ")}`);
    }
    return matches[0]!;
}
