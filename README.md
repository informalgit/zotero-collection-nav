# Zotero 分类导航栏

在 Zotero 左侧收藏夹栏顶部显示当前分类的**完整层级路径**，解决深层嵌套后「不知道自己在哪一层、父分类是谁」的问题。

```
!!🎓Career › A › A1
```

每一段都可点击，点击直接跳到该层级——父分类不用再往回翻树。

同时，鼠标悬停收藏夹树里任意一个分类，会以 tooltip 显示它的完整路径。

兼容 Zotero 7 – 10（在 Zotero 10.0.6 上验证，Windows / macOS 均可）。

---

## 安装

1. 从 [Releases](https://github.com/informalgit/zotero-collection-nav/releases/latest) 下载最新的 `.xpi`
2. Zotero → `工具` → `插件` → 右上角齿轮 → **Install Add-on From File...**
3. 选下载的 xpi → 重启 Zotero

也可以直接把 xpi 拖进插件窗口。

> **macOS**：菜单在屏幕顶部，路径为 `Tools` → `Add-ons`。下载后若 Safari 把文件变成 `.xpi.zip`，去掉 `.zip` 即可（xpi 本质是 zip）。

## 使用

| 操作 | 效果 |
|---|---|
| 点击面包屑中间的某一段 | 跳到该层级 |
| 悬停收藏夹树里任意分类 | tooltip 显示完整路径 |
| 选中「我的文库」 | 只显示文库名 |
| 选中已保存的搜索 | 显示搜索名 |

### 关于文库名

- **「我的文库」（个人库）不显示** —— 所有个人分类都在它下面，显示出来只是占宽度的冗余前缀
- **群组库会显示** —— 能看出这份分类属于哪个共享库，是有用信息
- **tooltip 始终给出完整路径**（含「我的文库」），提示框不受宽度限制

---

## 实现说明

只使用 Zotero 公开且稳定的 API，不修改 Zotero 自身文件，不写入任何用户数据：

| 用途 | API |
|---|---|
| 取当前选中的分类 | `ZoteroPane.collectionsView.getSelectedCollections()` |
| 选中变化事件 | `ZoteroPane.collectionsView.onSelect` |
| 跳转到分类 | `ZoteroPane.collectionsView.selectCollection(id)` |
| 取分类对象（同步） | `Zotero.Collections.get(id)` |
| 取文库对象（同步） | `Zotero.Libraries.get(libraryID)` |
| 行 → 行号 | 树行 DOM id 形如 `<treeId>-row-<index>`，反解后 `view.getRow(index)` |

关键设计：

- **启动时机**：Zotero 是「先开主窗口 → 再启动插件」，所以 `onMainWindowLoad` 钩子在此路径下不会触发。插件在 `startup` 里主动轮询 `Zotero.getMainWindow()` 直到 `collectionsView` 就绪。
- **层级回溯**：用 `while` 循环而非递归，深层嵌套不会爆栈。
- **DOM 锚点三级兜底**：工具栏 → tree-container → pane 顶部。即使将来 Zotero 改了元素 id 也能退化工作。
- **静默失效**：所有调用包 try/catch，注入失败不影响 Zotero 其他功能。
- **完全可逆**：停用插件时 `shutdown` 会摘掉 div、移除注入的 CSS、注销所有监听，界面立刻恢复原样。

## 卸载

`工具` → `插件` → 找到「Zotero 分类导航栏」→ 齿轮 → `Remove`。

插件不写入任何 Zotero 数据，卸载即完全干净。

---

## 开发

```
zotero-collection-nav/
├── manifest.json              插件清单（版本号唯一来源）
├── bootstrap.js               全部逻辑（单文件，无构建步骤）
├── icon.svg
├── update.json                自动更新清单（由脚本生成）
├── test/
│   └── logic.test.js          离线逻辑测试（mock 掉 Zotero API）
└── tools/
    ├── build.js               打包 xpi → dist/
    ├── make-update-json.js    生成 update.json
    └── register.js            写入 extensions.json（仅 GUI 装不上时兜底）
```

常用命令：

```bash
node test/logic.test.js        # 跑测试
node tools/build.js            # 打包到 dist/
node tools/make-update-json.js # 生成 update.json
```

### 发版流程

1. 改 `manifest.json` 里的 `version`
2. 提交并打 tag：`git tag v1.0.1 && git push origin v1.0.1`
3. GitHub Actions 自动：校验 tag 与版本一致 → 跑测试 → 打包 → 建 Release 传 xpi → 更新 `update.json`

### 调样式

改 `bootstrap.js` 里的 `ZCB.STYLE`（用 Zotero 的 CSS 变量，深浅色主题都兼容）。

---

## 相关方案对比

| 方案 | 解决什么 | 备注 |
|---|---|---|
| **本插件** | 面包屑 + 悬停完整路径 | 直接回答「我的父分类是谁」 |
| Ethereal Style → Collections | 收藏夹栏置顶、排序、条目数 | 置顶面板只显示叶子名，不显示路径 |
| Numify | 收藏夹名自动带层级编号 `01` / `01.02` | 路径信息写进名字，不依赖插件 |
| Zotero 原生 | `查看 → 显示子分类中的条目` | 解决的是「父分类看不到子分类文献」，不是路径显示 |

Zotero 本身没有收藏夹路径 / 面包屑功能（官方论坛上是长期未实现的 feature request），所以有了这个插件。

## License

[MIT](LICENSE)
