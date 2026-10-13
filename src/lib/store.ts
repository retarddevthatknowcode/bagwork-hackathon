import { create } from "zustand";

export type View =
  | { name: "landing" }
  | { name: "dashboard" }
  | { name: "campaign-detail"; id: string }
  | { name: "leaderboard" }
  | { name: "submit"; id: string }
  | { name: "docs" };

/**
 * The product console is a real Next.js route tree (`/dashboard/**`) with its own
 * shell, its own API routes, and a shareable URL per screen. This legacy marketing
 * SPA therefore hands every *product* view over to it instead of rendering the old
 * in-page dashboard — one product UI, one source of truth.
 */
export const CONSOLE_HOME = "/dashboard";

/** Real console URL for a legacy product view, or `null` when it stays in the SPA. */
export function consoleHref(view: View): string | null {
  switch (view.name) {
    case "dashboard":
      return CONSOLE_HOME;
    case "campaign-detail":
    case "submit":
      return `${CONSOLE_HOME}/bags/${view.id}`;
    default:
      // landing · leaderboard · docs are marketing surfaces, they stay here
      return null;
  }
}

function navigate(href: string) {
  if (typeof window === "undefined") return;
  window.location.assign(href);
}

interface AppState {
  view: View;
  go: (view: View) => void;
  /** Jump straight into the creator console from anywhere in the site. */
  goToConsole: () => void;
  scrollTop: () => void;
}

/**
 * Marketing-surface state only.
 *
 * Wallet state used to live here as plain booleans with a hardcoded address
 * ("7xK...Sh1LLz9Qp") and invented totals (142.5 earned, trust 78) — a fake session
 * that any visitor got on click. Authentication and the wallet address now come from
 * Privy (`useAuth()`), and every figure shown anywhere comes from the database.
 */
export const useApp = create<AppState>((set) => ({
  view: { name: "landing" },
  go: (view) => {
    // Product views live in the real console route tree — navigate there so the
    // URL, the shell, and the server data all come from the App Router.
    const href = consoleHref(view);
    if (href) {
      navigate(href);
      return;
    }
    set({ view });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  },
  goToConsole: () => navigate(CONSOLE_HOME),
  scrollTop: () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  },
}));
