import { getM1Snapshot } from "../src/lib/m1-engine";

async function main() {
  const s = await getM1Snapshot({ skipSpoofDelay: true });
  console.log(
    JSON.stringify(
      {
        ok: s.ok,
        error: s.error,
        timeframe: s.timeframe,
        live_price: s.live_price,
        live_vwap: s.live_vwap,
        cvd: s.cvd,
        signal: s.signal,
        inflows: s.flow.inflows,
        outflows: s.flow.outflows,
        walls: s.walls.slice(0, 6).map((w) => ({
          side: w.side,
          price: w.price,
          btc: w.btc,
          whale: w.whale,
        })),
        venues: s.venues,
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
