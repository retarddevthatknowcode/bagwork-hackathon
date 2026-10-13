"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Image as ImageIcon,
  Link2,
  Lock,
  Megaphone,
  Package,
  Pin,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";

import { EASE, Stagger, StaggerItem } from "./docs-motion";

/**
 * Diagram — Campaign Communities (section 13).
 *
 * Three beats, top to bottom:
 *
 *   1. the flow: five steps in the order they actually happen, from funding a bag to following a
 *      pinned post, with a single line that draws itself across them on scroll;
 *   2. who can do what: the admin and the members side by side, because "read-only" is the part
 *      people assume and then get wrong;
 *   3. how to get in: the two different routes, one for the publisher and one for everyone else,
 *      plus the one thing the composer deliberately does not have.
 *
 * Every claim here matches the shipped feature. The role split, the pin control, the image and
 * link handling are all real; nothing is described that the routes do not enforce.
 *
 * Motion is limited to `opacity` and `transform` — a `scaleX` line, staggered reveals and a
 * reduced-motion path that renders the settled state, so nothing here animates layout.
 */

interface Step {
  n: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

/** The five steps, in the order they happen. */
const STEPS: Step[] = [
  {
    n: "01",
    title: "Create a Bag",
    body: "Fund a campaign and it opens for Bagworkers to join.",
    icon: Package,
  },
  {
    n: "02",
    title: "Create the community",
    body: "The publisher opens one space for that bag. One per bag.",
    icon: Megaphone,
  },
  {
    n: "03",
    title: "Bagworkers join the Bag",
    body: "Claiming a slot in the campaign is what makes someone a member.",
    icon: Users,
  },
  {
    n: "04",
    title: "The admin posts",
    body: "Briefs, rules, updates, images and links — from the publisher only.",
    icon: Send,
  },
  {
    n: "05",
    title: "Members follow along",
    body: "Everyone in the bag reads, with pinned posts kept at the top.",
    icon: Pin,
  },
];

/** What each side of the room can actually do. */
const ADMIN_CAN = [
  { icon: Send, text: "Post announcements" },
  { icon: ImageIcon, text: "Attach images" },
  { icon: Link2, text: "Share links" },
  { icon: Pin, text: "Pin a post to the top" },
];

const MEMBER_CAN = [
  { icon: Check, text: "Read every announcement" },
  { icon: Check, text: "See pinned posts first" },
  { icon: Check, text: "Open images and links" },
];

/** The flow rail: five steps plus the line that draws itself across them. */
function StepRail({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          How a community comes together
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          one per bag
        </span>
      </div>

      {/* The connector. `scaleX` on a transform, so the line drawing costs no layout. */}
      <span
        aria-hidden="true"
        className="relative mt-2.5 block h-px w-full overflow-hidden rounded-full bg-white/[0.08]"
      >
        <motion.span
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-[#ffe70e] to-[#bdfe00]"
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </span>

      <Stagger className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" step={0.07}>
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <StaggerItem key={step.n}>
              <div className="h-full rounded-lg border border-white/10 bg-black/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold tabular-nums text-[#ffe70e]/80">
                    {step.n}
                  </span>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5 text-white/35" />
                </div>
                <p className="mt-1.5 text-[11px] font-semibold leading-snug text-white">
                  {step.title}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/45">{step.body}</p>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}

/** The role split. The members' panel ends on the one thing they cannot do. */
function AbilitySplit() {
  return (
    <div className="mt-4">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
        Who can do what
      </span>

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-lg border border-[#ffe70e]/25 bg-[#ffe70e]/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ffe70e]">
            <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />
            Admin — the bag&apos;s publisher
          </div>
          <ul className="mt-2 space-y-1.5">
            {ADMIN_CAN.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.text}
                  className="flex items-start gap-2 text-[11px] text-white/70"
                >
                  <Icon aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#bdfe00]" />
                  <span>{item.text}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#bdfe00]">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            Members — everyone who joined
          </div>
          <ul className="mt-2 space-y-1.5">
            {MEMBER_CAN.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.text}
                  className="flex items-start gap-2 text-[11px] text-white/70"
                >
                  <Icon aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#bdfe00]" />
                  <span>{item.text}</span>
                </li>
              );
            })}
            {/* Given its own treatment: this is the line people assume they can cross. */}
            <li className="flex items-start gap-2 border-t border-white/[0.08] pt-1.5 text-[11px] text-white/40">
              <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#ff6b35]" />
              <span>Cannot send messages</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The two routes in, plus the one thing the composer deliberately does not have. */
function AccessTiles() {
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
        Getting in
      </span>

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#ffe70e]/25 bg-[#ffe70e]/[0.08] text-[#ffe70e]"
          >
            <Package className="h-3 w-3" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-white">Publishers</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">
              Open the community from the bag you funded — in My Bags, or on the bag itself.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#bdfe00]/25 bg-[#bdfe00]/[0.08] text-[#bdfe00]"
          >
            <Users className="h-3 w-3" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-white">Bagworkers</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">
              Join the bag first, then open Community. The button appears once you are in.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-2.5 flex items-start gap-2 border-t border-white/[0.08] pt-2.5 text-[10px] leading-relaxed text-white/40">
        <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
        <span>
          Announcements are text, images and links. There are no voice notes — a board people read
          later has to be searchable.
        </span>
      </p>
    </div>
  );
}

/** The diagram as it appears in the documentation. */
export function DiagramCommunity() {
  const reduce = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          Campaign Communities
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <Megaphone aria-hidden="true" className="h-3.5 w-3.5 text-[#ffe70e]" />
          One admin posts · everyone reads
        </span>
      </div>

      <StepRail reduce={Boolean(reduce)} />
      <AbilitySplit />
      <AccessTiles />
    </div>
  );
}
