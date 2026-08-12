"use client";

import { useEffect } from "react";

/** Full-screen lightbox for BOSS drop screenshots. */
export function BossDropsLightbox({
  open,
  onClose,
  name,
  imageData,
  note,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  imageData: string | null;
  note?: string | null;
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

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border-soft)] bg-[#151925] p-4 shadow-[var(--shadow-glow)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 掉落说明`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{name} · 掉落说明</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              点击外侧或按 Esc 关闭
              {note ? ` · ${note}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0 text-sm"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-black/60 p-2">
          {imageData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageData}
              alt={`${name} 掉落`}
              className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
            />
          ) : (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
              {note || "暂无掉落说明"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Paste zone for admin drop screenshots. */
export function BossDropsPasteZone({
  imageData,
  onChange,
}: {
  imageData: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        window.alert("图片过大，请控制在 4MB 以内");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => onChange(String(reader.result || ""));
      reader.readAsDataURL(file);
      return;
    }
  }

  return (
    <div className="space-y-2">
      <div
        tabIndex={0}
        onPaste={onPaste}
        className="flex min-h-[110px] cursor-text flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#0f1320] px-3 text-center outline-none focus:border-[rgba(123,108,255,0.5)]"
      >
        {imageData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageData}
            alt="掉落说明"
            className="max-h-36 rounded-lg object-contain"
          />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            点击此处后 Ctrl+V 粘贴掉落说明截图
          </p>
        )}
      </div>
      {imageData && (
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => onChange(null)}
        >
          清除掉落图片
        </button>
      )}
    </div>
  );
}
