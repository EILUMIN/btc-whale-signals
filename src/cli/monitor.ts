#!/usr/bin/env npx tsx
import { WhaleEngine } from "../lib/engine";

async function main() {
  const engine = new WhaleEngine({
    log: (message) => {
      console.log(message);
    },
    onSignal: () => {
      console.log("");
    },
  });

  console.log("BTC/USD Whale Signal Monitor");
  console.log("Local only — walang Telegram, Discord, o ibang chat bot.");
  console.log("Ctrl+C para umalis.\n");

  await engine.start();

  setInterval(() => {
    const snap = engine.snapshot();
    const price = snap.price
      ? `$${snap.price.usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
      : "—";
    process.stdout.write(
      `\rLive BTC ${price}  |  signals ${snap.stats.total}  |  feed ${snap.liveFeed ? "WS" : "poll"}  |  last scan ${snap.lastScanAt ?? "pending"}   `
    );
  }, 4_000);

  await new Promise(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
