/**
 * Auction high-bid fanfare sounds.
 *
 * Upload to server (fixed English names):
 *   /var/www/guild/public/sounds/da-ge.m4a          (>¥300  大哥)
 *   /var/www/guild/public/sounds/qi-ting-zhang.m4a  (>¥600  祁厅长)
 *   /var/www/guild/public/sounds/zhe-feng-du-ye.mp3 (>¥1000 折风渡夜)
 *
 * Playback rule: only one track at a time.
 * Higher tier may interrupt lower; same/lower never interrupts
 * a currently playing higher or same-tier track.
 */

export type BidFanfareTier = 300 | 600 | 1000;

const SOURCES: Record<BidFanfareTier, string[]> = {
  300: ["/sounds/da-ge.m4a", "/sounds/da-ge.mp3"],
  600: ["/sounds/qi-ting-zhang.m4a", "/sounds/qi-ting-zhang.mp3"],
  1000: ["/sounds/zhe-feng-du-ye.mp3", "/sounds/zhe-feng-du-ye.m4a"],
};

const audioCache = new Map<BidFanfareTier, HTMLAudioElement>();
const resolvedSrc = new Map<BidFanfareTier, string>();
let unlocked = false;
let playingTier: BidFanfareTier | null = null;
let playToken = 0;

function stopAllExcept(keep?: BidFanfareTier | null) {
  for (const [tier, audio] of audioCache) {
    if (keep != null && tier === keep) continue;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

function getCached(tier: BidFanfareTier, src: string) {
  let audio = audioCache.get(tier);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(tier, audio);
    audio.addEventListener("ended", () => {
      if (playingTier === tier) playingTier = null;
    });
  } else {
    const current = audio.getAttribute("src") || audio.src;
    if (!current.includes(src)) {
      audio.src = src;
    }
  }
  return audio;
}

async function resolveSource(tier: BidFanfareTier): Promise<string | null> {
  const cached = resolvedSrc.get(tier);
  if (cached) return cached;

  for (const src of SOURCES[tier]) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = new Audio();
      let settled = false;
      const finish = (v: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        probe.removeAttribute("src");
        probe.load();
        resolve(v);
      };
      const timer = window.setTimeout(() => finish(false), 2500);
      probe.addEventListener("canplaythrough", () => finish(true), {
        once: true,
      });
      probe.addEventListener("error", () => finish(false), { once: true });
      probe.preload = "auto";
      probe.src = src;
    });
    if (ok) {
      resolvedSrc.set(tier, src);
      return src;
    }
  }
  return null;
}

export async function unlockBidFanfare() {
  if (typeof window === "undefined") return;
  try {
    const src = (await resolveSource(300)) || SOURCES[300][0];
    const audio = getCached(300, src);
    const prev = audio.volume;
    audio.volume = 0.01;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = prev || 1;
    unlocked = true;
  } catch {
    /* need a real click */
  }
}

export function tierFromAmount(amount: number): BidFanfareTier | null {
  if (amount > 1000) return 1000;
  if (amount > 600) return 600;
  if (amount > 300) return 300;
  return null;
}

export function parseFanfareKind(kind: string): BidFanfareTier | null {
  if (kind === "bid_fanfare_1000") return 1000;
  if (kind === "bid_fanfare_600") return 600;
  if (kind === "bid_fanfare_300") return 300;
  return null;
}

/**
 * Play fanfare for a tier.
 * - Same tier while playing → keep current (do not restart/interrupt)
 * - Lower tier while higher playing → ignore
 * - Higher tier while lower playing → stop lower, play higher
 * - Only one track plays at a time
 */
export async function playBidFanfare(tier: BidFanfareTier) {
  if (typeof window === "undefined") return;

  // Same or lower cannot interrupt whatever is already playing
  if (playingTier != null && tier <= playingTier) {
    return;
  }

  const token = ++playToken;
  try {
    if (!unlocked) await unlockBidFanfare();
    if (token !== playToken) return;

    const src = (await resolveSource(tier)) || SOURCES[tier][0];
    if (token !== playToken) return;

    // Re-check after async gap: a higher request may have won
    if (playingTier != null && tier <= playingTier) return;

    stopAllExcept(null);
    const audio = getCached(tier, src);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    playingTier = tier;
    await audio.play();
    if (token !== playToken) {
      audio.pause();
      return;
    }
  } catch {
    if (playingTier === tier) playingTier = null;
  }
}

export function stopBidFanfare() {
  playToken += 1;
  playingTier = null;
  stopAllExcept(null);
}

export function buildFanfareMessage(
  tier: BidFanfareTier,
  memberName: string,
  amount: number,
) {
  if (tier === 1000) {
    return `大哥${memberName}牛逼！这件上品灵器非你莫属！`;
  }
  if (tier === 600) {
    return `${memberName}豪掷：¥${amount}，还有谁！`;
  }
  return `${memberName}出价：¥${amount}，势必拿下这件物品`;
}
