import type { TabModule } from "../core.ts";

export const PRIVATE_TAB_LOADERS: Record<string, () => Promise<TabModule>> = {};
