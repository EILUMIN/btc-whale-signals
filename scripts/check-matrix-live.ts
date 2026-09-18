import { getMatrixSnapshot } from "../src/lib/ccxt-engine";

async function main() {
  const s = await getMatrixSnapshot();
  console.log(
    JSON.stringify(
      {
        ok: s.ok,
        error: s.error,
        live_rsi: s.live_rsi,
        live_atr: s.live_atr,
        live_vwap: s.live_vwap,
        live_price: s.live_price,
        signal: s.signal,
        lock: s.lockText,
        venues: s.venues.map((v) => ({ n: v.name, ok: v.ok, last: v.last })),
        sell: s.sellPlan,
        source: s.source,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
