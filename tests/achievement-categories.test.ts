import { expect, test } from "bun:test";
import {
    ACHIEVEMENT_CATEGORY,
    ACHIEVEMENT_CATEGORY_LABELS,
    ACHIEVEMENT_CATEGORY_ORDER,
    ACHIEVEMENT_DESCRIPTIONS,
    ACHIEVEMENT_NAMES,
} from "../src/achievements/achievement-catalog.ts";

test("every catalog key has exactly one category and no extras exist", () => {
    expect(Object.keys(ACHIEVEMENT_CATEGORY).sort()).toEqual(Object.keys(ACHIEVEMENT_NAMES).sort());
});

test("every catalog key has a non empty description and no extras exist", () => {
    expect(Object.keys(ACHIEVEMENT_DESCRIPTIONS).sort()).toEqual(Object.keys(ACHIEVEMENT_NAMES).sort());
    for (const description of Object.values(ACHIEVEMENT_DESCRIPTIONS)) {
        expect(typeof description).toBe("string");
        expect(description.length).toBeGreaterThan(0);
    }
});

test("every category value is one of the declared categories", () => {
    const declared = new Set(ACHIEVEMENT_CATEGORY_ORDER);
    for (const category of Object.values(ACHIEVEMENT_CATEGORY)) {
        expect(declared.has(category)).toBe(true);
    }
});

test("every declared category has a label", () => {
    for (const category of ACHIEVEMENT_CATEGORY_ORDER) {
        expect(typeof ACHIEVEMENT_CATEGORY_LABELS[category]).toBe("string");
        expect(ACHIEVEMENT_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
});

test("the streamer category matches the assigned keys", () => {
    const streamer = Object.entries(ACHIEVEMENT_CATEGORY)
        .filter(([, category]) => category === "streamer")
        .map(([key]) => key)
        .sort();
    expect(streamer).toEqual([
        "airtime", "alert_sound_set", "audience", "categories", "category_set",
        "channel_clip_views", "channel_clips", "chat_received", "days_streamed",
        "first_stream", "followers", "multistream_sessions", "panels_added",
        "points_renamed", "stream_streak", "thumbnail_set",
    ].sort());
});

test("the viewer category matches the assigned keys", () => {
    const viewer = Object.entries(ACHIEVEMENT_CATEGORY)
        .filter(([, category]) => category === "viewer")
        .map(([key]) => key)
        .sort();
    expect(viewer).toEqual([
        "avatar_set", "bio_set", "channels_watched", "chat_color_set", "clip_views",
        "clips_created", "developer", "email_verified", "first_clip", "first_follow",
        "first_message", "follows", "invites", "link_added", "made_mod", "made_vip",
        "messages_sent", "visit_streak", "watch_hours",
    ].sort());
});

test("the meta category matches the assigned keys", () => {
    const meta = Object.entries(ACHIEVEMENT_CATEGORY)
        .filter(([, category]) => category === "meta")
        .map(([key]) => key)
        .sort();
    expect(meta).toEqual(["collector", "completionist_profile", "completionist_setup", "early_bird"].sort());
});
