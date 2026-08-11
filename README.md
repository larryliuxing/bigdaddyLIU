# 公会助手

游戏公会身份登录系统。首页为身份选择登录，登录后进入功能入口；拍卖、BOSS 计时器、排行榜功能模块预留中。

## 功能

- **身份选择登录**：选择成员昵称，首次设置密码（至少 6 位），之后需验证密码
- **功能首页**：拍卖 / BOSS 计时器 / 排行榜入口（暂为占位）
- **管理员后台**：右上角齿轮按钮，使用管理员账号进入，可管理成员（增删、改角色、重置密码）

## 默认管理员

- 账号：`admin`
- 密码：`admin123`

可在 `.env.local` 中通过 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 修改（仅在首次初始化数据库时生效）。

## 开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 技术栈

- Next.js (App Router) + TypeScript + Tailwind CSS
- SQLite (`better-sqlite3`) 本地存储
- JWT Cookie Session + bcrypt 密码哈希
