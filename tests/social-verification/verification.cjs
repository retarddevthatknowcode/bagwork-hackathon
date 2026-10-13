/**
 * Anti-fraud social verification — the rules that decide whether content can be submitted.
 *
 * These are pure functions guarding money, so every branch is exercised here rather than trusted:
 * the handle forms that must match, the URL shapes that genuinely cannot name their author, and
 * each way a submission must be refused.
 *
 * Run:
 *   npx tsc src/lib/social/verify.ts src/lib/types.ts \
 *     --outDir tests/social-verification/.compiled --module commonjs --target es2020 \
 *     --moduleResolution node --esModuleInterop --skipLibCheck
 *   node tests/social-verification/verification.cjs
 */
const {
  extractHandle,
  normaliseHandle,
  platformFromUrl,
  verifiedAccounts,
  verifySubmissionAccount,
} = require("./.compiled/social/verify.js");

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${detail}` : ""}`);
  }
}

console.log("\n--- platform detection from the link ---");
check("x.com -> x", platformFromUrl("https://x.com/a/status/1") === "x");
check("twitter.com -> x", platformFromUrl("https://twitter.com/a/status/1") === "x");
check("tiktok.com -> tiktok", platformFromUrl("https://www.tiktok.com/@a/video/1") === "tiktok");
check("instagram.com -> instagram", platformFromUrl("https://instagram.com/a/reel/1") === "instagram");
check("youtube.com -> youtube", platformFromUrl("https://youtube.com/@a/video/1") === "youtube");
check("youtu.be -> youtube", platformFromUrl("https://youtu.be/abc") === "youtube");
check("an unrelated host -> null", platformFromUrl("https://example.com/post/1") === null);
check("not a URL -> null", platformFromUrl("hello world") === null);

console.log("\n--- extracting the author from a post link ---");
check("X post", extractHandle("https://x.com/alice/status/123", "x") === "alice");
check(
  "X post, mixed case host and handle",
  extractHandle("https://www.Twitter.com/Alice/status/123?s=20", "x") === "alice",
);
check("X profile link only -> null", extractHandle("https://x.com/alice", "x") === null);
check("X reserved path -> null", extractHandle("https://x.com/i/status/123", "x") === null);
check("TikTok post", extractHandle("https://www.tiktok.com/@alice/video/7213", "tiktok") === "alice");
check("TikTok short link -> null", extractHandle("https://vm.tiktok.com/ZMabc/", "tiktok") === null);
check(
  "Instagram profile-scoped reel",
  extractHandle("https://www.instagram.com/alice/reel/ABC/", "instagram") === "alice",
);
check("Instagram canonical /reel/ -> null", extractHandle("https://www.instagram.com/reel/ABC/", "instagram") === null);
check("Instagram canonical /p/ -> null", extractHandle("https://instagram.com/p/ABC/", "instagram") === null);
check("Instagram post", extractHandle("https://instagram.com/alice/p/ABC/", "instagram") === "alice");
check("YouTube @handle short", extractHandle("https://www.youtube.com/@alice/shorts/abc", "youtube") === "alice");
check("YouTube @handle video", extractHandle("https://youtube.com/@alice/video/abc", "youtube") === "alice");
check("YouTube watch link -> null", extractHandle("https://www.youtube.com/watch?v=abc", "youtube") === null);
check("YouTube /shorts/ without a channel -> null", extractHandle("https://youtube.com/shorts/abc", "youtube") === null);
check("YouTube youtu.be -> null", extractHandle("https://youtu.be/abc", "youtube") === null);
check("YouTube legacy /c/ name", extractHandle("https://youtube.com/c/alice", "youtube") === "alice");
check("junk -> null", extractHandle("not a url", "x") === null);

console.log("\n--- normalising what the user typed in their profile ---");
check("@Alice -> alice", normaliseHandle("@Alice") === "alice");
check("Alice -> alice", normaliseHandle("Alice") === "alice");
check("a profile URL -> alice", normaliseHandle("https://x.com/Alice") === "alice");
check("a TikTok profile URL -> alice", normaliseHandle("https://www.tiktok.com/@alice") === "alice");
check("empty -> empty", normaliseHandle("") === "");
check("null -> empty", normaliseHandle(null) === "");
check("trailing slash is dropped", normaliseHandle("alice/") === "alice");

console.log("\n--- reading the connected accounts off a profile ---");
const accounts = verifiedAccounts({ x: "@Alice", tiktok: "bob", instagram: "", junk: "nope" });
check("x is normalised", accounts.x === "alice", accounts.x);
check("tiktok is read", accounts.tiktok === "bob", accounts.tiktok);
check("an empty value is not an account", accounts.instagram === undefined);
check("an unknown platform key is ignored", Object.keys(accounts).length === 2, Object.keys(accounts).join(","));
check("no socials at all is empty", Object.keys(verifiedAccounts(null)).length === 0);

console.log("\n--- the rule: content must come from a verified account ---");

let r = verifySubmissionAccount({
  url: "https://x.com/alice/status/1",
  platform: "x",
  socials: null,
});
check("nothing connected -> no_accounts", r.ok === false && r.code === "no_accounts", r.code);
// Says where to fix it. That place is Settings: verification is an OAuth flow there, not a text
// field, so "your profile" would send someone to a page with nothing to click. See
// `components/console/social-verification.tsx`.
check("  message points at Settings", !r.ok && r.message.includes("Settings"), !r.ok ? r.message : "");

r = verifySubmissionAccount({
  url: "https://x.com/alice/status/1",
  platform: "x",
  socials: { x: "alice" },
});
check("own verified post -> accepted", r.ok === true && r.handle === "alice", r.ok ? r.handle : r.message);

r = verifySubmissionAccount({
  url: "https://x.com/alice/status/1",
  platform: "x",
  socials: { x: "@ALICE" },
});
check("matching is case- and @-insensitive", r.ok === true, r.ok ? "" : r.message);

r = verifySubmissionAccount({
  url: "https://x.com/someoneelse/status/1",
  platform: "x",
  socials: { x: "alice" },
});
check("someone else's post -> not_connected", r.ok === false && r.code === "not_connected", r.code);
check("  names the rejected handle", !r.ok && r.message.includes("@someoneelse"), !r.ok ? r.message : "");
check(
  "  and names the verified one, so the fix is obvious",
  !r.ok && r.message.includes("@alice"),
  !r.ok ? r.message : "",
);

r = verifySubmissionAccount({
  url: "https://x.com/alice/status/1",
  platform: "x",
  socials: { tiktok: "alice" },
});
check("verified elsewhere but not here -> not_connected", r.ok === false && r.code === "not_connected", r.code);
check(
  "  says the account is not verified",
  !r.ok && r.message.includes("not verified"),
  !r.ok ? r.message : "",
);

r = verifySubmissionAccount({
  url: "https://www.tiktok.com/@bob/video/1",
  platform: "x",
  socials: { x: "alice", tiktok: "bob" },
});
check("link host disagrees with the picker -> wrong_platform", r.ok === false && r.code === "wrong_platform", r.code);
check("  says which platform it really is", !r.ok && r.message.includes("TikTok"), !r.ok ? r.message : "");
check("  and reminds them of the account there", !r.ok && r.message.includes("@bob"), !r.ok ? r.message : "");

r = verifySubmissionAccount({
  url: "https://www.youtube.com/watch?v=abc",
  platform: "youtube",
  socials: { youtube: "alice" },
});
check("a link that cannot name its author -> unverifiable", r.ok === false && r.code === "unverifiable_link", r.code);
check("  explains which link form to use", !r.ok && r.message.includes("@yourhandle"), !r.ok ? r.message : "");

r = verifySubmissionAccount({
  url: "https://www.instagram.com/reel/ABC/",
  platform: "instagram",
  socials: { instagram: "alice" },
});
check("canonical Instagram link -> unverifiable", r.ok === false && r.code === "unverifiable_link", r.code);

r = verifySubmissionAccount({
  url: "https://example.com/my-post",
  platform: "x",
  socials: { x: "alice" },
});
check("a link from no supported platform -> unverifiable", r.ok === false && r.code === "unverifiable_link", r.code);

r = verifySubmissionAccount({
  url: "https://youtube.com/@alice/shorts/abc",
  platform: "youtube",
  socials: { youtube: "alice" },
});
check("YouTube @handle short is accepted", r.ok === true, r.ok ? "" : r.message);

r = verifySubmissionAccount({
  url: "https://www.tiktok.com/@alice/video/1",
  platform: "tiktok",
  socials: { tiktok: "AlIcE" },
});
check("TikTok own post with messy casing -> accepted", r.ok === true, r.ok ? "" : r.message);

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

