/**
 * Play「来啦老弟」when a BOSS countdown hits zero.
 *
 * Custom file (recommended): put on the server at
 *   /var/www/guild/public/sounds/lai-la-lao-di.mp4
 * Also accepted: .m4a / .mp3 / .ogg / .wav with the same basename.
 */

import { applySoundVolume, getSoundVolume, registerSoundElement } from "@/lib/sound/volume";

const SOUND_CANDIDATES = [
  "/sounds/lai-la-lao-di.mp4",
  "/sounds/lai-la-lao-di.m4a",
  "/sounds/lai-la-lao-di.mp3",
  "/sounds/lai-la-lao-di.ogg",
  "/sounds/lai-la-lao-di.wav",
];

let sharedAudio: HTMLAudioElement | null = null;
let resolvedSrc: string | null = null;
let unlocked = false;

function pickExistingSource(): Promise<string | null> {
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= SOUND_CANDIDATES.length) {
        resolve(null);
        return;
      }
      const src = SOUND_CANDIDATES[i++];
      const probe = new Audio();
      const done = (ok: boolean) => {
        probe.removeAttribute("src");
        probe.load();
        if (ok) resolve(src);
        else tryNext();
      };
      probe.addEventListener("canplaythrough", () => done(true), { once: true });
      probe.addEventListener("error", () => done(false), { once: true });
      probe.preload = "auto";
      probe.src = `${src}?v=${Date.now()}`;
    };
    tryNext();
  });
}

async function getAudio() {
  if (typeof window === "undefined") return null;
  if (sharedAudio && resolvedSrc) return sharedAudio;

  const src = resolvedSrc ?? (await pickExistingSource());
  if (!src) return null;
  resolvedSrc = src.split("?")[0];

  sharedAudio = new Audio(resolvedSrc);
  sharedAudio.preload = "auto";
  registerSoundElement(sharedAudio);
  return sharedAudio;
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export async function unlockBossSpawnSound() {
  const audio = await getAudio();
  if (!audio) return;
  try {
    audio.volume = 0.01;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    applySoundVolume(audio);
    unlocked = true;
  } catch {
    /* still locked until a real click */
  }
}

export async function playLaiLaLaoDi() {
  if (typeof window === "undefined") return;
  if (getSoundVolume() <= 0) return;

  try {
    if (!unlocked) await unlockBossSpawnSound();
    const audio = await getAudio();
    if (!audio) {
      speakFallback();
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    applySoundVolume(audio);
    await audio.play();
  } catch {
    speakFallback();
  }
}

function speakFallback() {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance("来啦老弟");
    utter.lang = "zh-CN";
    utter.rate = 1.05;
    utter.pitch = 1.1;
    utter.volume = getSoundVolume();
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore */
  }
}

/** Force re-resolve after you replace the file on disk. */
export function resetBossSpawnSoundCache() {
  if (sharedAudio) {
    sharedAudio.pause();
    sharedAudio = null;
  }
  resolvedSrc = null;
  unlocked = false;
}
