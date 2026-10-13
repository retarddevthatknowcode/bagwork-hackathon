"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";

import { adminPost } from "./api";

/** Password gate for the operator console. The cookie it sets is httpOnly. */
export function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await adminPost("/api/admin/login", { password });
      onAuthed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#171717] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-[#2f2f2f] bg-[#141414] p-8"
      >
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E8924C]/30 bg-[#E8924C]/10">
            <Lock className="h-7 w-7 text-[#E8924C]" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-white">Admin Portal</h1>
          <p className="mt-1 text-xs text-white/40">
            Enter the operator password to continue
          </p>
        </div>

        <label className="sr-only" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Password"
          autoFocus
          className="w-full rounded-xl border border-[#333] bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-[#E8924C]/50"
        />
        {error ? (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {error}
          </p>
        ) : null}

        <button
          onClick={submit}
          disabled={busy || !password}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#E8924C] py-3 text-sm font-bold uppercase tracking-wider text-black transition-transform hover:scale-[0.98] active:scale-95 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enter
        </button>
      </motion.div>
    </div>
  );
}
