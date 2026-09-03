import type { Metadata } from "next";
import { GlobalVolumeControl } from "@/components/GlobalVolumeControl";
import "./globals.css";

export const metadata: Metadata = {
  title: "天堂2盟约 · 费沙服务器专用盟助手",
  description: "天堂2盟约费沙服务器公会助手：拍卖、BOSS计时、排行榜",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <GlobalVolumeControl />
      </body>
    </html>
  );
}
