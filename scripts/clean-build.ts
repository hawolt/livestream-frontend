import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const entries = await readdir(publicDirectory, { withFileTypes: true });

await Promise.all(entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
    .map(entry => rm(join(publicDirectory, entry.name), { force: true })));

await rm(join(publicDirectory, "dash"), { recursive: true, force: true });
