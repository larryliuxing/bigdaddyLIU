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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
  const [open, setOpen] = useState(false);

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
    <div className="fixed right-3 bottom-24 z-[80] flex flex-col items-center gap-2">
      {open && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.96)] px-2.5 py-3 shadow-[var(--shadow-glow)]">
          <span className="text-[11px] tabular-nums text-[var(--accent-gold)]">
            {percent}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-label="全局音量"
            className="sound-volume-slider"
            onPointerDown={unlock}
            onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
          />
          <span className="text-[10px] text-[var(--text-muted)]">音量</span>
        </div>
      )}
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[rgba(18,22,34,0.96)] text-[var(--text-primary)] shadow-[var(--shadow-glow)]"
        title={muted ? "音量已关，点击打开调节" : `全局音量 ${percent}%`}
        aria-label="全局音量"
        aria-expanded={open}
        onClick={() => {
          unlock();
          if (open && muted) {
            toggleSoundMute();
            return;
          }
          setOpen((v) => !v);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          unlock();
          toggleSoundMute();
        }}
      >
        <SpeakerIcon muted={muted} />
      </button>
    </div>
  );
}
