"use client";

import type { AuctionItem } from "@/lib/types";
import {
  auctionItemStatusLabel,
  qualityMeta,
} from "@/lib/auction/client";
import {
  formatAuctionYuan,
  groupAuctionResultsByWinner,
} from "@/lib/auction/resultGroups";
import {
  AuctionItemThumb,
  type AuctionItemViewerPayload,
} from "./AuctionItemImage";

export function AuctionResultsByWinner({
  items,
  title = "拍品结果",
  highlightMemberId = null,
  onOpenItem,
}: {
  items: AuctionItem[];
  title?: string;
  highlightMemberId?: number | null;
  onOpenItem: (payload: AuctionItemViewerPayload) => void;
}) {
  const { winners, unsold } = groupAuctionResultsByWinner(items);

  if (items.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
        <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
          {title}
        </div>
        <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
          该场次暂无拍品
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
      <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
        {title}
      </div>
      {winners.map((group) => {
        const isSelf =
          highlightMemberId != null &&
          group.winnerMemberId === highlightMemberId;
        return (
          <div
            key={group.key}
            className={
              isSelf ? "bg-[rgba(232,168,74,0.06)]" : undefined
            }
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
              <div className="min-w-0">
                <p
                  className={`truncate font-medium ${
                    isSelf ? "text-[var(--accent-gold)]" : ""
                  }`}
                >
                  {group.winnerName}
                  {isSelf ? "（我）" : ""}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {group.items.length} 件
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-[var(--text-muted)]">合计应付</p>
                <p className="text-base font-semibold tabular-nums text-[var(--accent-gold)]">
                  {formatAuctionYuan(group.total)}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-[var(--border-soft)]">
              {group.items.map((item) => (
                <ResultItemRow
                  key={item.id}
                  item={item}
                  onOpenItem={onOpenItem}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {unsold.length > 0 && (
        <div>
          <div className="border-y border-[var(--border-soft)] px-4 py-3">
            <p className="font-medium text-[var(--text-muted)]">未成交</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {unsold.length} 件 · 无需转账
            </p>
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {unsold.map((item) => (
              <ResultItemRow
                key={item.id}
                item={item}
                unsold
                onOpenItem={onOpenItem}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ResultItemRow({
  item,
  unsold = false,
  onOpenItem,
}: {
  item: AuctionItem;
  unsold?: boolean;
  onOpenItem: (payload: AuctionItemViewerPayload) => void;
}) {
  const price = Number(item.soldPrice);
  const hasPrice = Number.isFinite(price) && price > 0;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <AuctionItemThumb
          itemId={item.id}
          imageData={item.imageData}
          hasImage={item.hasImage}
          name={item.name}
          quality={item.quality}
          className="h-12 w-12 shrink-0"
          onOpen={(payload) =>
            onOpenItem({
              ...payload,
              detail: unsold
                ? auctionItemStatusLabel(item.status)
                : hasPrice
                  ? `成交 ${formatAuctionYuan(price)} · ${item.winnerName ?? ""}`
                  : auctionItemStatusLabel(item.status),
            })
          }
        />
        <span className="truncate">
          <span
            className="mr-2 inline-block h-2 w-2 rounded-full"
            style={{ background: qualityMeta(item.quality).color }}
          />
          {item.name}
        </span>
      </div>
      <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
        {unsold
          ? auctionItemStatusLabel(item.status)
          : hasPrice
            ? formatAuctionYuan(price)
            : auctionItemStatusLabel(item.status)}
      </span>
    </li>
  );
}
