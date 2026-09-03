const STORAGE_KEY = "guild-sound-volume";
const LAST_KEY = "guild-sound-volume-last";
export const DEFAULT_SOUND_VOLUME = 0.8;

const listeners = new Set<(volume: number) => void>();
const elements = new Set<HTMLAudioElement>();

let loaded = false;
let volume = DEFAULT_SOUND_VOLUME;
let lastNonZero = DEFAULT_SOUND_VOLUME;

export function clampSoundVolume(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function loadStored() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored != null) volume = clampSoundVolume(stored);
  const last = window.localStorage.getItem(LAST_KEY);
  if (last != null) lastNonZero = clampSoundVolume(last) || DEFAULT_SOUND_VOLUME;
  if (volume > 0) lastNonZero = volume;
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(volume));
  window.localStorage.setItem(LAST_KEY, String(lastNonZero));
}

function notify() {
  for (const el of elements) {
    try {
      el.volume = volume;
    } catch {
      /* ignore */
    }
  }
  for (const fn of listeners) fn(volume);
}

export function getSoundVolume() {
  loadStored();
  return volume;
}

export function setSoundVolume(next: number) {
  loadStored();
  volume = clampSoundVolume(next);
  if (volume > 0) lastNonZero = volume;
  persist();
  notify();
  return volume;
}

export function toggleSoundMute() {
  loadStored();
  return setSoundVolume(volume > 0 ? 0 : lastNonZero || DEFAULT_SOUND_VOLUME);
}

export function subscribeSoundVolume(listener: (volume: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerSoundElement(el: HTMLAudioElement) {
  elements.add(el);
  el.volume = getSoundVolume();
  return () => {
    elements.delete(el);
  };
}

export function applySoundVolume(el: HTMLAudioElement) {
  el.volume = getSoundVolume();
}
