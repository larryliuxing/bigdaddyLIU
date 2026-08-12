/**
 * Auction high-bid fanfare sounds.
 *
 * Upload to server (fixed names):
 *   /var/www/guild/public/sounds/da-ge.m4a          (>¥300)
 *   /var/www/guild/public/sounds/qi-ting-zhang.m4a  (>¥600)
 *   /var/www/guild/public/sounds/zhe-feng-du-ye.mp3 (>¥1000)
 */

export type BidFanfareTier = 300 | 600 | 1000;

const SOURCES: Record<BidFanfareTier, string[]> = {
  300: ["/sounds/da-ge.m4a", "/sounds/da-ge.mp3"],
  600: ["/sounds/qi-ting-zhang.m4a", "/sounds/qi-ting-zhang.mp3"],
  1000: ["/sounds/zhe-feng-du-ye.mp3", "/sounds/zhe-feng-du-ye.m4a"],
};

const audioCache = new Map<BidFanfareTier, HTMLAudioElement>();
let unlocked = false;

function getCached(tier: BidFanfareTier, src: string) {
  let audio = audioCache.get(tier);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(tier, audio);
  } else if (!audio.src.endsWith(src) && !audio.src.includes(src)) {
    audio.src = src;
  }
  return audio;
}

async function resolveSource(tier: BidFanfareTier): Promise<string | null> {
  for (const src of SOURCES[tier]) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = new Audio();
      const finish = (v: boolean) => {
        probe.removeAttribute("src");
        probe.load();
        resolve(v);
      };
      probe.addEventListener("canplaythrough", () => finish(true), {
        once: true,
      });
      probe.addEventListener("error", () => finish(false), { once: true });
      probe.preload = "auto";
      probe.src = src;
    });
    if (ok) return src;
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

export function fanfareKind(tier: BidFanfareTier) {
  return `bid_fanfare_${tier}` as const;
}

export function parseFanfareKind(kind: string): BidFanfareTier | null {
  if (kind === "bid_fanfare_1000") return 1000;
  if (kind === "bid_fanfare_600") return 600;
  if (kind === "bid_fanfare_300") return 300;
  return null;
}

export async function playBidFanfare(tier: BidFanfareTier) {
  if (typeof window === "undefined") return;
  try {
    if (!unlocked) await unlockBidFanfare();
    const src = (await resolveSource(tier)) || SOURCES[tier][0];
    const audio = getCached(tier, src);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    await audio.play();
  } catch {
    /* missing file or autoplay blocked */
  }
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
