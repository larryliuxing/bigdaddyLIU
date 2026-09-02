# 办公文档目录

本目录是用仓库里的 GitHub Pull Request 数据整理出来的周会材料，不是业务代码。

| 文件 | 用途 |
| --- | --- |
| [研发进度周报.md](./研发进度周报.md) | 周会主稿：结论、指标、模块清单、风险 |
| [功能模块说明书.md](./功能模块说明书.md) | 按登录/排行榜/拍卖/BOSS/成员整理的功能说明和验收勾选 |
| [开发进度分析.xlsx](./开发进度分析.xlsx) | 可直接用 WPS / Excel 打开：明细、饼图、柱状图、分支链路 |
| [pr-inventory.csv](./pr-inventory.csv) | 可导入飞书表格 / 腾讯文档 |
| [项目进度看板.html](./项目进度看板.html) | 浏览器打开的只读看板 |
| [pr-source.json](./pr-source.json) | 原始 PR 数据 |
| [generate_reports.py](./generate_reports.py) | 重新生成上述文件 |

刷新数据：

```bash
gh pr list --state all --limit 100 \
  --json number,title,state,createdAt,updatedAt,mergedAt,isDraft,headRefName,baseRefName,url \
  > docs/office/pr-source.json
python3 docs/office/generate_reports.py
```
