import {
  SPOOF_KEEP_RATIO,
  WALL_BUCKET_USD,
  type WallSide,
  type WhaleWall,
} from "@/lib/m1";

export type WallStatus =
  | "APPROACHING"
  | "HIT"
  | "REJECTED"
  | "BROKEN"
  | "REMOVED";

export type WallHit = {
  timestamp: string;
  price: number;
  exchange: string;
  side: WallSide;
  btc: number;
};

export type WallTrack = {
  key: string;
  wall: WhaleWall;
  status: WallStatus;
  hit: WallHit | null;
  updatedAt: number;
};

export const WALL_REMOVED_KEEP_MS = 10 * 60_000;

export function wallTrackKey(wall: Pick<WhaleWall, "side" | "price">) {
  const bucket = Math.round(wall.price / WALL_BUCKET_USD) * WALL_BUCKET_USD;
  return `${wall.side}:${bucket}`;
}

/** HIT only when live price is inside the card's displayed range. */
export function priceInDisplayedWallRange(
  live: number,
  wall: Pick<WhaleWall, "priceLow" | "priceHigh">
) {
  if (!(live > 0)) return false;
  if (!(wall.priceLow > 0) || !(wall.priceHigh > 0)) return false;
  return live >= wall.priceLow && live <= wall.priceHigh;
}

function primaryExchange(wall: Pick<WhaleWall, "venues">) {
  return wall.venues[0] || "unknown";
}

function makeHit(wall: WhaleWall, live: number, nowMs: number): WallHit {
  return {
    timestamp: new Date(nowMs).toISOString(),
    price: live,
    exchange: primaryExchange(wall),
    side: wall.side,
    btc: wall.btc,
  };
}

function persists(wall: WhaleWall, hit: WallHit | null) {
  const baseline = hit?.btc ?? wall.btc;
  return wall.btc >= baseline * SPOOF_KEEP_RATIO;
}

function throughWall(live: number, wall: WhaleWall) {
  return wall.side === "ask" ? live > wall.priceHigh : live < wall.priceLow;
}

function rejectedAway(live: number, wall: WhaleWall) {
  return wall.side === "ask" ? live < wall.priceLow : live > wall.priceHigh;
}

function withStatus(wall: WhaleWall, status: WallStatus, hit: WallHit | null): WhaleWall {
  return { ...wall, status, hit };
}

function transition(
  prev: WallTrack | undefined,
  wall: WhaleWall | null,
  live: number,
  nowMs: number
): WallTrack | null {
  const view = wall ?? prev?.wall;
  if (!view) return null;
  const key = prev?.key ?? wallTrackKey(view);
  const hit = prev?.hit ?? null;
  const inRange = priceInDisplayedWallRange(live, view);

  if (!wall) {
    let status: WallStatus;
    if (!prev || prev.status === "APPROACHING") status = "REMOVED";
    else if (prev.status === "HIT") status = "BROKEN";
    else if (prev.status === "REJECTED") status = "REMOVED";
    else status = prev.status;
    return {
      key,
      wall: view,
      status,
      hit,
      updatedAt: prev && prev.status === status ? prev.updatedAt : nowMs,
    };
  }

  if (inRange) {
    const keepHit = prev?.status === "HIT" && hit ? hit : makeHit(wall, live, nowMs);
    return {
      key,
      wall,
      status: "HIT",
      hit: keepHit,
      updatedAt: nowMs,
    };
  }

  const hadHit =
    Boolean(hit) ||
    prev?.status === "HIT" ||
    prev?.status === "REJECTED" ||
    prev?.status === "BROKEN";

  if (hadHit) {
    if (throughWall(live, wall)) {
      return { key, wall, status: "BROKEN", hit, updatedAt: nowMs };
    }
    if (rejectedAway(live, wall) && persists(wall, hit)) {
      if (prev?.status === "BROKEN") {
        return { key, wall, status: "APPROACHING", hit: null, updatedAt: nowMs };
      }
      return { key, wall, status: "REJECTED", hit, updatedAt: nowMs };
    }
    if (rejectedAway(live, wall) && !persists(wall, hit)) {
      return { key, wall, status: "BROKEN", hit, updatedAt: nowMs };
    }
    return {
      key,
      wall,
      status: prev?.status ?? "APPROACHING",
      hit,
      updatedAt: nowMs,
    };
  }

  return {
    key,
    wall,
    status: "APPROACHING",
    hit: null,
    updatedAt: nowMs,
  };
}

export class WallStatusBook {
  constructor(private readonly tracks = new Map<string, WallTrack>()) {}

  reset() {
    this.tracks.clear();
  }

  observe(input: {
    walls: WhaleWall[];
    live: number;
    nowMs?: number;
  }): WhaleWall[] {
    const nowMs = input.nowMs ?? Date.now();
    const seen = new Set<string>();
    const out: WhaleWall[] = [];

    for (const wall of input.walls) {
      const key = wallTrackKey(wall);
      seen.add(key);
      const next = transition(this.tracks.get(key), wall, input.live, nowMs);
      if (!next) continue;
      this.tracks.set(key, next);
      out.push(withStatus(wall, next.status, next.hit));
    }

    for (const [key, prev] of this.tracks) {
      if (seen.has(key)) continue;
      const next = transition(prev, null, input.live, nowMs);
      if (!next) {
        this.tracks.delete(key);
        continue;
      }
      const age = nowMs - next.updatedAt;
      if (
        age > WALL_REMOVED_KEEP_MS &&
        (next.status === "REMOVED" || next.status === "BROKEN")
      ) {
        this.tracks.delete(key);
        continue;
      }
      this.tracks.set(key, next);
      out.push(withStatus(next.wall, next.status, next.hit));
    }

    return out.sort((a, b) => b.btc - a.btc);
  }
}

export function annotateWalls(
  walls: WhaleWall[],
  live: number,
  book: WallStatusBook,
  nowMs?: number
) {
  return book.observe({ walls, live, nowMs });
}
