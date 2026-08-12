/** Play「来啦老弟」when a BOSS countdown hits zero. */

let sharedAudio: HTMLAudioElement | null = null;

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio("/sounds/lai-la-lao-di.mp3");
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export function unlockBossSpawnSound() {
  const audio = getAudio();
  if (!audio) return;
  const prev = audio.volume;
  audio.volume = 0.01;
  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = prev || 1;
    }).catch(() => {
      audio.volume = prev || 1;
    });
  }
}

export function playLaiLaLaoDi() {
  if (typeof window === "undefined") return;

  const audio = getAudio();
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => speakFallback());
      }
      return;
    } catch {
      // fall through
    }
  }
  speakFallback();
}

function speakFallback() {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance("来啦老弟");
    utter.lang = "zh-CN";
    utter.rate = 1.05;
    utter.pitch = 1.1;
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore */
  }
}
