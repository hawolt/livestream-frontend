export type AchievementKey =
    | "audience"
    | "airtime"
    | "days_streamed"
    | "stream_streak"
    | "followers"
    | "channel_clips"
    | "channel_clip_views"
    | "multistream_sessions"
    | "categories"
    | "chat_received"
    | "first_stream"
    | "thumbnail_set"
    | "category_set"
    | "panels_added"
    | "points_renamed"
    | "alert_sound_set"
    | "watch_hours"
    | "follows"
    | "messages_sent"
    | "visit_streak"
    | "invites"
    | "clips_created"
    | "clip_views"
    | "channels_watched"
    | "avatar_set"
    | "bio_set"
    | "link_added"
    | "chat_color_set"
    | "email_verified"
    | "made_mod"
    | "made_vip"
    | "developer"
    | "first_follow"
    | "first_message"
    | "first_clip"
    | "collector"
    | "completionist_profile"
    | "completionist_setup"
    | "early_bird";

export const ACHIEVEMENT_NAMES: Record<AchievementKey, string> = {
    audience: "Audience",
    airtime: "Airtime",
    days_streamed: "Regular Show",
    stream_streak: "On Fire",
    followers: "Following",
    channel_clips: "Clip Farm",
    channel_clip_views: "Reach",
    multistream_sessions: "Everywhere",
    categories: "Variety",
    chat_received: "Busy Chat",
    first_stream: "On Air",
    thumbnail_set: "Set Dressing",
    category_set: "Filed",
    panels_added: "Furnished",
    points_renamed: "Mint",
    alert_sound_set: "Signature Sound",
    watch_hours: "Screen Time",
    follows: "Devoted",
    messages_sent: "Chatterbox",
    visit_streak: "Every Day",
    invites: "Recruiter",
    clips_created: "Editor",
    clip_views: "Trending",
    channels_watched: "Explorer",
    avatar_set: "Face Up",
    bio_set: "Storyteller",
    link_added: "Connected",
    chat_color_set: "True Colors",
    email_verified: "Cleared",
    made_mod: "Trusted",
    made_vip: "Honored",
    developer: "Builder",
    first_follow: "First Follow",
    first_message: "First Words",
    first_clip: "First Cut",
    collector: "Collector",
    completionist_profile: "Profile Completionist",
    completionist_setup: "Setup Completionist",
    early_bird: "Early Bird",
};

const SPARK = '<path d="M27.2 8.5 L28.2 11.3 L31 12.3 L28.2 13.3 L27.2 16.1 L26.2 13.3 L23.4 12.3 L26.2 11.3 Z" fill="#fbbf24"/>';

export const ACHIEVEMENT_GLYPHS: Record<AchievementKey, string> = {
    audience: '<ellipse cx="20" cy="20" rx="9.5" ry="6" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="#fbbf24"/>',
    airtime: '<path d="M13.5 11.5 H26.5 L21.5 20 L26.5 28.5 H13.5 L18.5 20 Z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/><path d="M16.8 26 H23.2 L20 21.5 Z" fill="#fbbf24"/>',
    days_streamed: '<rect x="12.5" y="10.5" width="17" height="15" rx="2" fill="#ffffff" opacity="0.35"/><rect x="10" y="13.5" width="17" height="15" rx="2" fill="#ffffff"/><rect x="10" y="13.5" width="17" height="4.5" rx="2" fill="#fbbf24"/><rect x="10" y="16" width="17" height="2" fill="#fbbf24"/>',
    stream_streak: '<path d="M20 9 C23.5 13.4 26 16.4 26 21 A6 6 0 0 1 14 21 C14 16.4 16.5 13.4 20 9 Z" fill="#ffffff"/><path d="M20 16.5 C21.8 18.6 23 20 23 22.2 A3 3 0 0 1 17 22.2 C17 20 18.2 18.6 20 16.5 Z" fill="#fbbf24"/>',
    followers: '<path d="M20 28 C14.4 23.6 11.5 20.5 11.5 17.2 A4.4 4.4 0 0 1 20 15.6 A4.4 4.4 0 0 1 28.5 17.2 C28.5 20.5 25.6 23.6 20 28 Z" fill="#ffffff"/><rect x="24.8" y="8.5" width="2.4" height="7" rx="1.2" fill="#fbbf24"/><rect x="22.5" y="10.8" width="7" height="2.4" rx="1.2" fill="#fbbf24"/>',
    channel_clips: '<path d="M11 15.5 L27.5 12 L28.4 16.2 L11.9 19.7 Z" fill="#fbbf24"/><rect x="11" y="18.5" width="18" height="10" rx="2" fill="#ffffff"/>',
    channel_clip_views: '<path d="M16.5 14 L27 20 L16.5 26 Z" fill="#ffffff"/><path d="M11 13 L13.5 15.5 M9.5 20 H13 M11 27 L13.5 24.5" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>',
    multistream_sessions: '<circle cx="11.5" cy="20" r="2.5" fill="#fbbf24"/><path d="M14 20 C18 20 18 13 22.5 13 M14 20 H22.5 M14 20 C18 20 18 27 22.5 27" fill="none" stroke="#ffffff" stroke-width="2"/><path d="M22.5 10.8 L26.8 13 L22.5 15.2 Z" fill="#ffffff"/><path d="M22.5 17.8 L26.8 20 L22.5 22.2 Z" fill="#ffffff"/><path d="M22.5 24.8 L26.8 27 L22.5 29.2 Z" fill="#ffffff"/>',
    categories: '<rect x="11" y="11" width="8" height="8" rx="2" fill="#ffffff"/><rect x="21" y="11" width="8" height="8" rx="2" fill="#ffffff"/><rect x="11" y="21" width="8" height="8" rx="2" fill="#ffffff"/><rect x="21" y="21" width="8" height="8" rx="2" fill="#fbbf24"/>',
    chat_received: '<rect x="14" y="10.5" width="16" height="10" rx="3" fill="#ffffff" opacity="0.35"/><rect x="10" y="15" width="16" height="10" rx="3" fill="#ffffff"/><path d="M13 25 L13 29 L17.5 25 Z" fill="#ffffff"/><circle cx="14.5" cy="20" r="1.3" fill="#fbbf24"/><circle cx="18" cy="20" r="1.3" fill="#fbbf24"/><circle cx="21.5" cy="20" r="1.3" fill="#fbbf24"/>',
    first_stream: '<path d="M20 14 V27" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="11.8" r="2.2" fill="#fbbf24"/><path d="M14 14.5 a8 8 0 0 0 0 11" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M26 14.5 a8 8 0 0 1 0 11" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>',
    thumbnail_set: '<rect x="10.5" y="12" width="19" height="16" rx="2" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="15.5" cy="17" r="1.8" fill="#fbbf24"/><path d="M12.5 25.5 L18 19.5 L21.5 23 L24.5 20 L27.5 25.5 Z" fill="#ffffff"/>',
    category_set: '<path d="M11 11.5 H19.5 L28.5 20.5 A2.2 2.2 0 0 1 28.5 23.6 L22.6 29.5 A2.2 2.2 0 0 1 19.5 29.5 L11 20.9 Z" fill="#ffffff"/><circle cx="15.6" cy="16.1" r="1.8" fill="#fbbf24"/>',
    panels_added: '<rect x="10.5" y="11.5" width="11" height="17" rx="1.5" fill="#ffffff"/><rect x="23.5" y="11.5" width="6.5" height="8" rx="1.5" fill="#fbbf24"/><rect x="23.5" y="21.5" width="6.5" height="7" rx="1.5" fill="#ffffff"/>',
    points_renamed: '<circle cx="16" cy="21.5" r="6.5" fill="#fbbf24"/><circle cx="16" cy="21.5" r="4" fill="none" stroke="#1a2029" stroke-width="1.5"/><path d="M23 11.5 L27.5 16 L20 23.5 L15.8 24.7 L17 20.5 Z" fill="#ffffff"/>',
    alert_sound_set: '<path d="M20 10.5 C15.5 10.5 14 14 14 18 L14 22.5 L11.5 25.5 H28.5 L26 22.5 L26 18 C26 14 24.5 10.5 20 10.5 Z" fill="#ffffff"/><circle cx="20" cy="28" r="2" fill="#fbbf24"/>',
    watch_hours: '<circle cx="20" cy="20" r="9" fill="none" stroke="#ffffff" stroke-width="2"/><path d="M17.5 15.5 L25 20 L17.5 24.5 Z" fill="#fbbf24"/>',
    follows: '<path d="M20 28.5 C13.8 23.8 10.8 20.4 10.8 16.9 A4.8 4.8 0 0 1 20 15 A4.8 4.8 0 0 1 29.2 16.9 C29.2 20.4 26.2 23.8 20 28.5 Z" fill="#ffffff"/><path d="M20 24.4 C17.1 22.1 15.7 20.5 15.7 18.8 A2.3 2.3 0 0 1 20 17.9 A2.3 2.3 0 0 1 24.3 18.8 C24.3 20.5 22.9 22.1 20 24.4 Z" fill="#fbbf24"/>',
    messages_sent: '<rect x="11" y="12.5" width="18" height="11.5" rx="3.5" fill="#ffffff"/><path d="M15 24 L15 28.5 L19.8 24 Z" fill="#ffffff"/><circle cx="15.5" cy="18.2" r="1.3" fill="#fbbf24"/><circle cx="20" cy="18.2" r="1.3" fill="#fbbf24"/><circle cx="24.5" cy="18.2" r="1.3" fill="#fbbf24"/>',
    visit_streak: '<rect x="11.5" y="11.5" width="17" height="16" rx="2.5" fill="#ffffff"/><rect x="11.5" y="11.5" width="17" height="4.5" rx="2.5" fill="#fbbf24"/><rect x="11.5" y="14" width="17" height="2" fill="#fbbf24"/><path d="M15.5 21 L18.5 24 L24.5 18" fill="none" stroke="#1a2029" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    invites: '<circle cx="16.5" cy="15.5" r="3.6" fill="#ffffff"/><path d="M10 27.5 a6.5 6.5 0 0 1 13 0 Z" fill="#ffffff"/><rect x="24.8" y="14" width="2.4" height="9" rx="1.2" fill="#fbbf24"/><rect x="21.5" y="17.3" width="9" height="2.4" rx="1.2" fill="#fbbf24"/>',
    clips_created: '<circle cx="13.8" cy="25" r="2.8" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="13.8" cy="15" r="2.8" fill="none" stroke="#ffffff" stroke-width="2"/><path d="M16.1 23.6 L28 15 M16.1 16.4 L28 25" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><circle cx="19.6" cy="20" r="1.5" fill="#fbbf24"/>',
    clip_views: '<rect x="11.5" y="21" width="4.2" height="7.5" rx="1" fill="#ffffff"/><rect x="17.9" y="17" width="4.2" height="11.5" rx="1" fill="#ffffff"/><rect x="24.3" y="12" width="4.2" height="16.5" rx="1" fill="#fbbf24"/>',
    channels_watched: '<rect x="14" y="11.5" width="15.5" height="10.5" rx="2" fill="#ffffff" opacity="0.35"/><rect x="10.5" y="16" width="15.5" height="10.5" rx="2" fill="#ffffff"/><path d="M15.8 18.7 L21.8 21.25 L15.8 23.8 Z" fill="#fbbf24"/>',
    avatar_set: '<circle cx="20" cy="20" r="9.5" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="20" cy="17.2" r="3.2" fill="#fbbf24"/><path d="M14.2 26.5 a5.8 5.8 0 0 1 11.6 0 Z" fill="#ffffff"/>',
    bio_set: '<path d="M27 10.5 C21 11.5 16 15.5 14.5 21.5 L14 25.5 L18 25 C24 23.5 26.6 17.5 27 10.5 Z" fill="#ffffff"/><path d="M14.8 24.8 C18 20 22 15.5 26.3 11.5" fill="none" stroke="#fbbf24" stroke-width="1.4"/><path d="M11.5 28.7 H23.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>',
    link_added: '<g transform="rotate(-25 15 21)"><rect x="8.5" y="17.8" width="12" height="6.4" rx="3.2" fill="none" stroke="#ffffff" stroke-width="2"/></g><g transform="rotate(-25 25 19)"><rect x="19.5" y="15.8" width="12" height="6.4" rx="3.2" fill="none" stroke="#fbbf24" stroke-width="2"/></g>',
    chat_color_set: '<path d="M20 9.5 C24.5 15.5 27 19 27 23 A7 7 0 0 1 13 23 C13 19 15.5 15.5 20 9.5 Z" fill="#ffffff"/><circle cx="20" cy="23" r="3" fill="#fbbf24"/>',
    email_verified: '<rect x="10.5" y="13" width="19" height="14" rx="2" fill="#ffffff"/><path d="M11 14.5 L20 21.5 L29 14.5" fill="none" stroke="#1a2029" stroke-width="1.6"/><circle cx="26.5" cy="24.5" r="4.6" fill="#fbbf24"/><path d="M24.5 24.5 L26 26 L28.7 22.8" fill="none" stroke="#1a2029" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    made_mod: '<path d="M20 9.5 L28 12.5 V19 C28 24.5 24.7 27.8 20 30 C15.3 27.8 12 24.5 12 19 V12.5 Z" fill="#ffffff"/><path d="M20 14 L21.4 17 L24.6 17.4 L22.3 19.7 L22.9 22.9 L20 21.3 L17.1 22.9 L17.7 19.7 L15.4 17.4 L18.6 17 Z" fill="#fbbf24"/>',
    made_vip: '<path d="M13 13.5 H27 L30.5 18.5 H9.5 Z" fill="#fbbf24"/><path d="M9.5 18.5 H30.5 L20 29.5 Z" fill="#ffffff"/>',
    developer: '<path d="M14 15 L9.5 20 L14 25" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 15 L30.5 20 L26 25" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.5 13 L17.5 27" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>',
    first_follow: `<path d="M19 27.5 C14.2 23.9 11.8 21.1 11.8 18.2 A4 4 0 0 1 19 16.7 A4 4 0 0 1 26.2 18.2 C26.2 21.1 23.8 23.9 19 27.5 Z" fill="#ffffff"/>${SPARK}`,
    first_message: `<rect x="10.5" y="14.5" width="15.5" height="10" rx="3" fill="#ffffff"/><path d="M14 24.5 L14 28.5 L18.3 24.5 Z" fill="#ffffff"/>${SPARK}`,
    first_clip: `<circle cx="12.8" cy="26" r="2.5" fill="none" stroke="#ffffff" stroke-width="1.8"/><circle cx="12.8" cy="17" r="2.5" fill="none" stroke="#ffffff" stroke-width="1.8"/><path d="M14.9 24.7 L25 17.5 M14.9 18.3 L25 25.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>${SPARK}`,
    collector: '<path d="M14 11 H26 V16.5 A6 6 0 0 1 14 16.5 Z" fill="#ffffff"/><path d="M13.8 12.5 H10 a5 5 0 0 0 5 5.2" fill="none" stroke="#ffffff" stroke-width="1.8"/><path d="M26.2 12.5 H30 a5 5 0 0 1 -5 5.2" fill="none" stroke="#ffffff" stroke-width="1.8"/><rect x="18.6" y="21.8" width="2.8" height="3.4" fill="#ffffff"/><rect x="15" y="25.2" width="10" height="2.6" rx="1.3" fill="#fbbf24"/><circle cx="20" cy="14.2" r="1.9" fill="#fbbf24"/>',
    completionist_profile: '<circle cx="20" cy="18.5" r="8" fill="#ffffff"/><path d="M16.5 18.5 L19 21 L24 16" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 25 L13.5 29.8 L17.8 28.2 Z" fill="#ffffff"/><path d="M24 25 L26.5 29.8 L22.2 28.2 Z" fill="#ffffff"/>',
    completionist_setup: '<circle cx="20" cy="18.5" r="8" fill="#ffffff"/><path d="M16.5 18.5 L19 21 L24 16" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 25 L13.5 29.8 L17.8 28.2 Z" fill="#ffffff"/><path d="M24 25 L26.5 29.8 L22.2 28.2 Z" fill="#ffffff"/>',
    early_bird: '<path d="M10 26 H30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M14 26 A6 6 0 0 1 26 26 Z" fill="#fbbf24"/><path d="M20 12.5 V15.5 M11.5 16 L13.7 18.2 M28.5 16 L26.3 18.2" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>',
};

export const KNOWN_ACHIEVEMENT_KEYS: ReadonlySet<string> = new Set(Object.keys(ACHIEVEMENT_NAMES));
