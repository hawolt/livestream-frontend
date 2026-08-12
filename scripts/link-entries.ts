import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const dashDirectory = join(publicDirectory, "dash");

const PAGE_ENTRIES = [
    "explore", "live", "embed", "chat-overlay", "follow-alerts", "user-login",
    "register", "verify", "reset-password", "legal", "wiki", "clip-editor",
    "clip-embed", "multichat", "oauth-authorize", "status",
];
const DASH_ENTRIES = ["dashboard"];

async function builtName(directory: string, entry: string): Promise<string> {
    const files = await readdir(directory);
    const matches = files.filter(name => name.startsWith(`${entry}-`) && name.endsWith(".js")
        && !name.slice(entry.length + 1, -3).includes("-"));
    if (matches.length !== 1) {
        throw new Error(`expected exactly one built file for ${entry}, found ${matches.length}: ${matches.join(", ")}`);
    }
    return matches[0]!;
}

function rewrite(html: string, prefix: string, entry: string, file: string): string {
    const pattern = new RegExp(`(src=")${prefix}${entry}(?:-[A-Za-z0-9]+)?\\.js(")`, "g");
    return html.replace(pattern, `$1${prefix}${file}$2`);
}

const resolved: { prefix: string; entry: string; file: string }[] = [];
for (const entry of PAGE_ENTRIES) {
    resolved.push({ prefix: "/", entry, file: await builtName(publicDirectory, entry) });
}
for (const entry of DASH_ENTRIES) {
    resolved.push({ prefix: "/dash/", entry, file: await builtName(dashDirectory, entry) });
}

const pages = (await readdir(publicDirectory, { withFileTypes: true }))
    .filter(item => item.isFile() && item.name.endsWith(".html"))
    .map(item => join(publicDirectory, item.name));

let touched = 0;
for (const page of pages) {
    const original = await readFile(page, "utf8");
    let next = original;
    for (const { prefix, entry, file } of resolved) {
        next = rewrite(next, prefix, entry, file);
    }
    if (next !== original) {
        await writeFile(page, next);
        touched += 1;
    }
}

const missing: string[] = [];
for (const page of pages) {
    const html = await readFile(page, "utf8");
    for (const match of html.matchAll(/src="(\/(?:dash\/)?[A-Za-z0-9._-]+\.js)"/g)) {
        const reference = match[1]!;
        if (reference === "/details.js") continue;
        const onDisk = join(publicDirectory, reference.replace(/^\//, ""));
        if (!(await Bun.file(onDisk).exists())) missing.push(`${page} -> ${reference}`);
    }
}
if (missing.length) {
    throw new Error(`html references a bundle that was not built:\n  ${missing.join("\n  ")}`);
}

console.log(`linked ${resolved.length} entr${resolved.length === 1 ? "y" : "ies"}, rewrote ${touched} page(s)`);
