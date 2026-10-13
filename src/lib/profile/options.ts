/**
 * Profile vocabulary shared by the profile page and its editor.
 *
 * Kept in one place so a platform added in one cannot be missing from the other, and so
 * validation matches on both sides.
 *
 * There is deliberately no role list here any more. The product has one kind of account — anyone
 * can explore, submit, create a bag or launch a coin — and the Creator / Project / Both picker
 * that used to live alongside these was a question with no consequence attached to its answer.
 */

export const PLATFORMS = [
  { key: "x", label: "X / Twitter", hint: "Posts & threads" },
  { key: "tiktok", label: "TikTok", hint: "Short-form video" },
  { key: "youtube", label: "YouTube", hint: "Shorts & long-form" },
  { key: "instagram", label: "Instagram", hint: "Reels & carousels" },
];

/** Mirrors the server-side rule in `app/api/profile/route.ts`. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
