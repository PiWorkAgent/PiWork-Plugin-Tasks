# PiWork-Plugin-Tasks

PiWork 插件：日程本 —— 待办 / 日程 / 定时任务 / 每日记录。插件 id `com.pi.tasks`。

通过 [PiWork-Registry](https://github.com/PiWorkAgent/PiWork-Registry) 发布到 PiWork 插件中心。

## 开发

```bash
npm install
npm run build        # 后端 dist/main.mjs + 面板 ui-dist/panel
npm test
```

在 PiWork 仓库里实时调试：

```bash
PI_DEV_PLUGINS=/path/to/PiWork-Plugin-Tasks pnpm dev:desktop:plugins
```

## 发布

1. 改 `manifest.json` 的 `version`
2. 提交并推送 tag `v<version>`（或 Actions → Release → Run workflow）

Release 资产：`com.pi.tasks-<version>.zip` + `index.json`。

## 目录

| 路径 | 说明 |
| --- | --- |
| `manifest.json` | 插件清单：id、版本、`apiVersion`、权限、面板、工具 |
| `src/` | 后端与面板源码 |
| `dist/`、`ui-dist/` | 构建产物（`dist/` 已提交，`ui-dist/` 不提交） |
| `scripts/release.mjs` | 打包 + 生成单条目索引 |
