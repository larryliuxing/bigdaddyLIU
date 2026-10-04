# 公会助手

游戏公会系统：身份登录、拍卖、BOSS 计时器、排行榜。

## 功能

- **身份选择登录**：选择成员昵称，首次设置密码（至少 6 位），之后需验证密码
- **拍卖模块**：时间设置、拍品、OCR 分红成员、竞拍、自动分红与临时调整
- **BOSS 计时器**
  - 管理员设定 BOSS 名称、颜色、刷新概率、间隔小时、掉落说明
  - 成员点击「已击杀 / 未刷新」，**3 人在 10 秒内同意**后生效并开启新一轮计时
  - 倒计时卡片、在线人数、弹幕、悬浮窗
- **排行榜**：上传战力截图，OCR 校验名字一致后上榜；平均战力 85% 合格线，不合格标红
- **管理员后台**：齿轮入口（`admin` / `admin123`）

## 本地运行

```bash
cp .env.example .env.local
npm install
python3 -m venv ocr-service/.venv
ocr-service/.venv/bin/pip install paddlepaddle==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
ocr-service/.venv/bin/pip install -r requirements-ocr.txt
ocr-service/.venv/bin/python ocr-service/server.py
npm run dev
```

访问 http://localhost:3000。识别服务默认监听 `http://127.0.0.1:8765`，可用 `GUILD_OCR_URL` 覆盖。生产环境用 `pm2 start ocr-service/ecosystem.config.cjs` 常驻。

花体名单自检：`ocr-service/.venv/bin/python ocr-service/test_user_names.py`

## 技术栈

- Next.js (App Router) + TypeScript + Tailwind CSS
- SQLite (`better-sqlite3`)
- JWT Cookie Session + bcrypt
- 本机 PaddleOCR（`ocr-service/server.py`，默认 `127.0.0.1:8765`）
