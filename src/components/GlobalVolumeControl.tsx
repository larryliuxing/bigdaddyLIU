"use client";

import { useEffect, useState } from "react";
import { unlockBidFanfare } from "@/lib/auction/bidFanfare";
import { unlockBossSpawnSound } from "@/lib/boss/spawnSound";
import {
  getSoundVolume,
  setSoundVolume,
  subscribeSoundVolume,
  toggleSoundMute,
} from "@/lib/sound/volume";

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4Z"
        fill="currentColor"
      />
      {muted ? (
        <path
          d="m16 9 6 6m0-6-6 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M15.2 8.4a4.2 4.2 0 0 1 0 7.2M17.8 6a7.2 7.2 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function GlobalVolumeControl() {
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    setVolume(getSoundVolume());
    return subscribeSoundVolume(setVolume);
  }, []);

  function unlock() {
    void unlockBidFanfare();
    void unlockBossSpawnSound();
  }

  const percent = Math.round(volume * 100);
  const muted = volume <= 0;

  return (
    <div className="sound-volume-bar">
      <button
        type="button"
        className="sound-volume-mute"
        title={muted ? "点击恢复音量" : "点击静音"}
        aria-label={muted ? "恢复音量" : "静音"}
        onClick={() => {
          unlock();
          toggleSoundMute();
        }}
      >
        <SpeakerIcon muted={muted} />
      </button>
      <span className="sound-volume-label">音量</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label="全局音量"
        className="sound-volume-slider"
        style={{
          background: `linear-gradient(to right, var(--accent-gold) ${percent}%, rgba(255,255,255,0.14) ${percent}%)`,
        }}
        onPointerDown={unlock}
        onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
      />
      <span className="sound-volume-percent">{percent}%</span>
    </div>
  );
}
