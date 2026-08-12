"use client";

import { useEffect } from "react";
import { qualityMeta } from "@/lib/auction/client";
import type { ItemQuality } from "@/lib/types";

export function AuctionItemLightbox({
  open,
  onClose,
  imageData,
  name,
  quality,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  imageData: string;
  name: string;
  quality?: ItemQuality | null;
  detail?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const q = quality ? qualityMeta(quality) : null;

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border-soft)] bg-[#151925] p-4 shadow-[var(--shadow-glow)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 详细属性`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">
              {q && (
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: q.color }}
                />
              )}
              {name}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              点击图片外区域或按 Esc 关闭 · 可查看装备详细属性
              {detail ? ` · ${detail}` : ""}
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-black/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageData}
            alt={`${name} 详细属性`}
            className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

/** Clickable thumbnail that opens the attribute screenshot lightbox. */
export function AuctionItemThumb({
  imageData,
  name,
  quality,
  className,
  onOpen,
}: {
  imageData: string | null | undefined;
  name: string;
  quality?: ItemQuality | null;
  className?: string;
  onOpen: (payload: {
    imageData: string;
    name: string;
    quality?: ItemQuality | null;
  }) => void;
}) {
  if (!imageData) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-[#121826] text-xs text-[var(--text-muted)] ${className ?? ""}`}
      >
        无图
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`group relative overflow-hidden rounded-xl border border-transparent bg-[#121826] p-0 transition hover:border-[rgba(232,168,74,0.45)] focus:outline-none focus-visible:border-[rgba(232,168,74,0.65)] ${className ?? ""}`}
      onClick={() => onOpen({ imageData, name, quality })}
      title="点击放大查看详细属性"
      aria-label={`查看 ${name} 详细属性`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageData}
        alt={name}
        className="h-full w-full object-contain"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-white/90 opacity-0 transition group-hover:opacity-100">
        点击放大
      </span>
    </button>
  );
}
