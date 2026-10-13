/**
 * Checks the launch enable gate and the fee-swap floor, without touching the network.
 *
 * Run:  bun run verify:launch
 *
 * Why this exists: production reported "Launching is switched off" while
 * `PUMP_LAUNCH_ENABLED=true` was visibly set in the dashboard, and nothing outside the running
 * process could say *which* of three reasons it was — variable absent from that deployment, set to
 * a shape the parser refused, or added after the deployment was built. The parser is now tolerant
 * and reports which case it is; this script is the part that proves it, over the spellings people
 * actually type into an env dashboard.
 *
 * It calls the shipping functions rather than a copy of them, sets the variables itself and puts
 * them back afterwards. Nothing here signs, sends, or reads a private key: the treasury assertion
 * only asks whether an address can be derived at all.
 */
import { launchAvailability, launchFlagState } from "@/lib/launch/config";
import { DEFAULT_FEE_SWAP_MIN_USD, feeSwapMinUsd } from "@/lib/solana/jupiter";

/** Every value an operator plausibly pastes, plus the near-misses. */
const FLAG_CASES: { value: string | undefined; armed: boolean }[] = [
  { value: "true", armed: true },
  { value: "TRUE", armed: true },
  { value: " True ", armed: true },
  { value: '"true"', armed: true },
  { value: "'true'", armed: true },
  { value: "true\n", armed: true },
  { value: "1", armed: true },
  { value: "yes", armed: true },
  { value: "on", armed: true },
  { value: "false", armed: false },
  { value: "0", armed: false },
  { value: "enabled", armed: false },
  { value: "", armed: false },
  { value: "   ", armed: false },
  { value: undefined, armed: false },
];

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `  ${label.padEnd(30)} ${String(actual).padEnd(12)}` + (ok ? "" : ` <-- expected ${String(expected)}`),
  );
}

function withEnv(name: string, value: string | undefined, run: () => void) {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  run();
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

console.log("PUMP_LAUNCH_ENABLED parsing");
for (const { value, armed } of FLAG_CASES) {
  withEnv("PUMP_LAUNCH_ENABLED", value, () => {
    const state = launchFlagState();
    const present = value !== undefined && value.trim() !== "";
    check(`${JSON.stringify(value ?? null)} armed`, state.armed, armed);
    check(`${JSON.stringify(value ?? null)} present`, state.present, present);
    // "Set but unreadable" is the state that used to be indistinguishable from "not set".
    check(
      `${JSON.stringify(value ?? null)} unrecognised`,
      state.unrecognised,
      present && !armed,
    );
  });
}

console.log("");
console.log("launchAvailability()");
withEnv("PUMP_LAUNCH_ENABLED", "true", () => {
  const availability = launchAvailability();
  check("armed + FEE key resolvable", availability.enabled, true);
  check("treasury resolved", availability.treasury !== null, true);
  check("no reason when enabled", availability.reason, null);
  check("flag reported armed", availability.flag.armed, true);
  console.log(`  treasury (public)              ${availability.treasury}`);
});

withEnv("PUMP_LAUNCH_ENABLED", "false", () => {
  const availability = launchAvailability();
  check("off when flag is false", availability.enabled, false);
  check("reason explains the switch", availability.flag.unrecognised, true);
  console.log(`  reason                         ${availability.reason}`);
});

console.log("");
console.log("fee swap floor (FEE_SWAP_MIN_USD)");
const FLOOR_CASES: { value: string | undefined; floor: number }[] = [
  { value: undefined, floor: DEFAULT_FEE_SWAP_MIN_USD },
  { value: "", floor: DEFAULT_FEE_SWAP_MIN_USD },
  { value: "abc", floor: DEFAULT_FEE_SWAP_MIN_USD },
  { value: "20", floor: 20 },
  { value: "5", floor: 5 },
  { value: "0", floor: 0 },
];
for (const { value, floor } of FLOOR_CASES) {
  withEnv("FEE_SWAP_MIN_USD", value, () => {
    // Blank must not read as 0 — `Number("")` is 0, which silently removes the floor entirely.
    check(`${JSON.stringify(value ?? null)}`, feeSwapMinUsd(), floor);
  });
}

console.log("");
console.log(
  failures === 0
    ? `PASS — ${FLAG_CASES.length} flag cases and ${FLOOR_CASES.length} floor cases held`
    : `FAIL — ${failures} assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
