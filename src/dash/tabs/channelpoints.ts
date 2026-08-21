import type { LiveInfo } from "../../api.ts";
import { esc } from "../format.ts";
import { validatePointsName } from "../points-name.ts";
import {
    clampRewardCost,
    REWARD_COST_MAX,
    REWARD_COST_MIN,
    REWARD_LIMIT,
    rewardLimitReached,
    validateRewardCost,
    validateRewardTitle,
} from "../reward-rules.ts";
import { authFetch } from "../session.ts";
import { wireStepper } from "../stepper.ts";

interface Reward {
    id: number;
    kind: "custom" | "highlight";
    title: string;
    cost: number;
    enabled: boolean;
    requiresText: boolean;
}

interface RewardsResponse {
    rewards: Reward[];
}

let liveCache: LiveInfo | null = null;
let rewardsCache: Reward[] = [];
let activationGeneration = 0;
let active = false;
const operationRevisions = new Map<string, number>();

interface RewardsOperation {
    key: string;
    generation: number;
    revision: number;
}

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function beginOperation(key: string): RewardsOperation {
    const revision = (operationRevisions.get(key) ?? 0) + 1;
    operationRevisions.set(key, revision);
    return { key, generation: activationGeneration, revision };
}

function isCurrentOperation(operation: RewardsOperation): boolean {
    return isCurrentActivation(operation.generation)
        && operationRevisions.get(operation.key) === operation.revision;
}

function rewardsError(message: string): void {
    const el = document.getElementById("cp-rewards-error");
    if (el) el.textContent = message;
}

function applyRewards(rewards: Reward[]): void {
    rewardsCache = rewards;
    renderRewards();
}

function costStepper(id: string, value: number): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "stepper cp-cost-stepper";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper-btn";
    minus.dataset["step"] = "-1";
    minus.setAttribute("aria-label", "Decrease");
    minus.textContent = "−";
    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.min = String(REWARD_COST_MIN);
    input.max = String(REWARD_COST_MAX);
    input.step = "1";
    input.value = String(value);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper-btn";
    plus.dataset["step"] = "1";
    plus.setAttribute("aria-label", "Increase");
    plus.textContent = "+";
    wrap.append(minus, input, plus);
    wireStepper(input);
    return wrap;
}

async function updateReward(reward: Reward, body: Partial<Pick<Reward, "title" | "cost" | "enabled" | "requiresText">>, revert: () => void): Promise<void> {
    const operation = beginOperation(`reward-update-${reward.id}`);
    rewardsError("");
    try {
        const res = await authFetch<RewardsResponse>(`/api/live/points/rewards/${reward.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
        });
        if (isCurrentOperation(operation)) applyRewards(res.rewards);
    } catch (e) {
        if (!isCurrentOperation(operation)) return;
        rewardsError(e instanceof Error ? e.message : String(e));
        revert();
    }
}

async function deleteReward(reward: Reward, btn: HTMLButtonElement): Promise<void> {
    if (!confirm(`Delete the reward "${reward.title}"? Viewers can no longer redeem it.`)) return;
    const operation = beginOperation("reward-delete");
    btn.disabled = true;
    rewardsError("");
    try {
        const res = await authFetch<RewardsResponse>(`/api/live/points/rewards/${reward.id}`, { method: "DELETE" });
        if (isCurrentOperation(operation)) applyRewards(res.rewards);
    } catch (e) {
        if (!isCurrentOperation(operation)) return;
        rewardsError(e instanceof Error ? e.message : String(e));
        btn.disabled = false;
    }
}

function buildRewardRow(reward: Reward): HTMLElement {
    const row = document.createElement("div");
    row.className = "cp-reward-row";

    const title = document.createElement("span");
    title.className = "cp-reward-title";
    title.textContent = reward.title;
    row.appendChild(title);

    if (reward.kind === "highlight") {
        const chip = document.createElement("span");
        chip.className = "cp-reward-chip";
        chip.textContent = "Built in";
        chip.title = "Highlights a chat message. Always available; only cost and availability can be changed.";
        row.appendChild(chip);
        const asks = document.createElement("span");
        asks.className = "cp-reward-chip";
        asks.textContent = "Takes a message";
        asks.title = "The highlight reward always takes the message it highlights.";
        row.appendChild(asks);
    }

    const cost = costStepper(`cp-reward-cost-${reward.id}`, reward.cost);
    const costInput = cost.querySelector("input") as HTMLInputElement;
    let costTimer: number | null = null;
    costInput.addEventListener("change", () => {
        if (costTimer !== null) window.clearTimeout(costTimer);
        costTimer = window.setTimeout(() => {
            costTimer = null;
            const result = validateRewardCost(costInput.value);
            const next = result.ok ? result.value : clampRewardCost(Number(costInput.value));
            costInput.value = String(next);
            if (next === reward.cost) return;
            void updateReward(reward, { cost: next }, () => { costInput.value = String(reward.cost); });
        }, 500);
    });
    row.appendChild(cost);

    const toggle = document.createElement("label");
    toggle.className = "cp-reward-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = reward.enabled;
    const toggleText = document.createElement("span");
    toggleText.textContent = "Enabled";
    toggle.append(checkbox, toggleText);
    checkbox.addEventListener("change", () => {
        void updateReward(reward, { enabled: checkbox.checked }, () => { checkbox.checked = reward.enabled; });
    });
    row.appendChild(toggle);

    if (reward.kind === "custom") {
        const asks = document.createElement("label");
        asks.className = "cp-reward-toggle";
        asks.title = "Viewers type an answer when they redeem it, and it is attached to the chat message and the alert.";
        const asksBox = document.createElement("input");
        asksBox.type = "checkbox";
        asksBox.checked = reward.requiresText;
        const asksText = document.createElement("span");
        asksText.textContent = "Requires input";
        asks.append(asksBox, asksText);
        asksBox.addEventListener("change", () => {
            void updateReward(reward, { requiresText: asksBox.checked }, () => { asksBox.checked = reward.requiresText; });
        });
        row.appendChild(asks);

        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-sm btn-danger";
        del.textContent = "Delete";
        del.addEventListener("click", () => void deleteReward(reward, del));
        row.appendChild(del);
    }

    return row;
}

function renderRewards(): void {
    const el = document.getElementById("cp-rewards-list");
    if (!el) return;
    el.replaceChildren(...rewardsCache.map(buildRewardRow));
    const addBtn = document.getElementById("cp-reward-add") as HTMLButtonElement | null;
    const hint = document.getElementById("cp-rewards-limit");
    const full = rewardLimitReached(rewardsCache.length);
    if (addBtn) addBtn.disabled = full;
    if (hint) hint.textContent = full ? `Reward limit reached (${REWARD_LIMIT}). Delete one to add another.` : "";
}

async function loadRewards(generation: number): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const operation = beginOperation("rewards-load");
    rewardsError("");
    try {
        const res = await authFetch<RewardsResponse>("/api/live/points/rewards");
        if (isCurrentOperation(operation)) applyRewards(res.rewards);
    } catch (e) {
        if (!isCurrentOperation(operation)) return;
        document.getElementById("cp-rewards-list")?.replaceChildren();
        rewardsError(e instanceof Error ? e.message : String(e));
    }
}

async function createReward(): Promise<void> {
    const titleInput = document.getElementById("cp-new-title") as HTMLInputElement | null;
    const costInput = document.getElementById("cp-new-cost") as HTMLInputElement | null;
    const requiresTextInput = document.getElementById("cp-new-requires-text") as HTMLInputElement | null;
    const addBtn = document.getElementById("cp-reward-add") as HTMLButtonElement | null;
    if (!titleInput || !costInput || !addBtn) return;
    const title = validateRewardTitle(titleInput.value);
    if (!title.ok) {
        rewardsError(title.error ?? "Invalid title.");
        return;
    }
    const cost = validateRewardCost(costInput.value);
    if (!cost.ok) {
        rewardsError(cost.error ?? "Invalid cost.");
        return;
    }
    const operation = beginOperation("reward-create");
    addBtn.disabled = true;
    rewardsError("");
    try {
        const res = await authFetch<RewardsResponse>("/api/live/points/rewards", {
            method: "POST",
            body: JSON.stringify({
                title: title.value,
                cost: cost.value,
                requiresText: requiresTextInput?.checked === true,
            }),
        });
        if (!isCurrentOperation(operation)) return;
        titleInput.value = "";
        if (requiresTextInput) requiresTextInput.checked = false;
        applyRewards(res.rewards);
    } catch (e) {
        if (isCurrentOperation(operation)) rewardsError(e instanceof Error ? e.message : String(e));
    } finally {
        if (isCurrentOperation(operation)) renderRewards();
    }
}

function renderPointsName(): void {
    const el = document.getElementById("live-points-name-body");
    if (!el || !liveCache) return;
    const name = liveCache.pointsName ?? "";
    el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="live-points-name" type="text" maxlength="24" placeholder="Channel points" value="${esc(name)}" style="flex:1;min-width:0" autocomplete="off" spellcheck="false">
            <button class="btn btn-primary" id="live-points-name-save" style="flex:0 0 auto">Save</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">2 to 24 letters, digits and spaces. Leave blank to clear. Shown when viewers hover the points chip.</div>
        <div id="live-points-name-error" style="color:var(--red);font-size:13px;margin-top:6px"></div>
        <div id="live-points-name-status" style="font-size:12px;min-height:16px;margin-top:4px"></div>`;
    document.getElementById("live-points-name-save")?.addEventListener("click", async () => {
        const input = document.getElementById("live-points-name") as HTMLInputElement;
        const errEl = document.getElementById("live-points-name-error")!;
        const status = document.getElementById("live-points-name-status")!;
        errEl.textContent = "";
        status.textContent = "";
        const result = validatePointsName(input.value);
        if (!result.ok) {
            errEl.textContent = result.error ?? "Invalid name.";
            return;
        }
        const btn = document.getElementById("live-points-name-save") as HTMLButtonElement;
        btn.disabled = true;
        try {
            const res = await authFetch<{ pointsName: string | null }>("/api/live/points-name", {
                method: "PUT",
                body: JSON.stringify({ name: result.value }),
            });
            if (liveCache) liveCache.pointsName = res.pointsName;
            input.value = res.pointsName ?? "";
            status.textContent = "Saved.";
            status.style.color = "var(--success)";
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
        } finally {
            btn.disabled = false;
        }
    });
}

async function loadPointsName(generation: number): Promise<void> {
    const el = document.getElementById("live-points-name-body");
    if (el) el.textContent = "Loading...";
    try {
        const info = await authFetch<LiveInfo>("/api/live");
        if (!isCurrentActivation(generation)) return;
        liveCache = info;
        renderPointsName();
    } catch (e) {
        if (!isCurrentActivation(generation)) return;
        if (el) el.textContent = e instanceof Error ? e.message : String(e);
    }
}

export function init(): void {
    const form = document.getElementById("cp-reward-form") as HTMLFormElement | null;
    form?.addEventListener("submit", (e) => {
        e.preventDefault();
        void createReward();
    });
    const costInput = document.getElementById("cp-new-cost") as HTMLInputElement | null;
    if (costInput) wireStepper(costInput);
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void loadPointsName(generation);
    void loadRewards(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
}
