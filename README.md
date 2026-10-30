# 舒尔特方格闯关小游戏（shuerte）

> 用最短时间按顺序点完 N×N 方格里的数字，逐关进阶的专注力训练小游戏。Taro + React 多端项目，主发微信小程序，同时可编译为 H5 预览与传播。

**当前版本 v2.1 ·「乐谱纸 · 墨水与暖光」古风改版。** 玩法、关卡数值、星级规则、功能状态与里程碑见 **[`docs/game.md`](./docs/game.md)**；本文只讲技术栈、构建部署、架构与改动指引。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Taro 4.1.9 + React 18 + TypeScript 5 |
| 样式 | Sass + CSS Modules（设计稿基准 750rpx，代码统一写 rpx） |
| 状态 | zustand（含 persist，同步存储到 Taro Storage） |
| 工具 | classnames、dayjs |
| 平台能力 | `Taro.createInnerAudioContext`（音效）、`Taro.vibrateShort`（震动）、`Taro.setStorageSync`（存档）、WebAudio（演奏音实时合成） |
| 后端 | 无（M1 纯本地，不涉及登录与云开发） |

---

## 快速开始

### 环境要求

- Node.js 16+
- npm 或 yarn
- IDE：推荐使用 Trae CN（内置预览服务）

### 安装依赖

```bash
npm install
# 或
yarn install
```

### 本地预览（推荐）

本项目在 IDE 内通过**内置预览服务**构建与预览，不要直接执行 `npm run build:*` / `taro build`（会造成预览链路与产物不一致），也不需要安装任何外部开发者工具。

```bash
# 启动 / 刷新预览服务（非阻塞后台运行）
node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\preview-server.js" d:\working\play\yanlidazuozhan\shuerte
```

预览服务会输出 `[TraePreviewUrl]`，在浏览器中打开即可实时查看。预览页面支持配置微信 / 支付宝 / 抖音小程序凭证，点击「生成二维码」后可直接扫码真机预览、上传代码、跳转提审发布。

> 注意：不要删除 `.pai/pai-preview-server.lock`，它用于复用端口；删除后预览链接会失效。

### H5 预览

```bash
npm run dev:h5
```

### 编译为 H5（用于部署或分享）

```bash
npm run build:h5
# 或
yarn build:h5
```

编译产物在 `dist/h5` 目录，可直接部署到静态服务器。

---

## 部署

### 方式一：Vercel 部署（H5 版本，推荐快速分享）

**首次部署**

1. 安装 Vercel CLI：
   ```bash
   npm install -g vercel
   ```

2. 登录 Vercel：
   ```bash
   vercel login
   ```

3. 构建并部署：
   ```bash
   npm run build:h5
   vercel --prod dist --yes
   ```

4. 部署完成后会生成访问链接（如 `https://shuerte-xxx.vercel.app`），分享给别人即可。

**后续更新**

```bash
npm run build:h5
vercel --prod dist --yes
```

**关联已有项目**

首次部署时选择 `Link to existing project` → 输入项目名即可关联。

**SPA 路由配置**

项目已内置 `dist/vercel.json`，配置了前端路由重写，刷新页面不会 404。

> 提示：也可通过 Vercel Dashboard 拖拽上传 `dist/` 目录内容（注意上传目录内的文件，而非目录本身）。

### 方式二：微信小程序发布（miniprogram-ci）

小程序代码上传走 **`miniprogram-ci`** 命令行方式，脚本已就绪：`config/upload.js`。

**前置准备（一次性）**

1. 在[微信公众平台](https://mp.weixin.qq.com) →「开发」→「开发管理」→「开发设置」→「小程序代码上传」中生成并下载**代码上传密钥**，保存为项目根目录的 `private.wx.key`（已被 `.gitignore` 的 `*.key` 规则忽略，不会提交到仓库）
2. 同一位置配置 **IP 白名单**：把执行上传的机器公网 IP 加入白名单；若 IP 不固定（家庭 / 公司宽带），建议直接关闭白名单校验
3. 确认 `config/upload.js` 中的 `appid` 与目标小程序一致

**编译 + 上传（一步完成）**

```bash
# 校验密钥 → 编译 dist/weapp/ → 打包上传，任一步失败即中止
npm run release
```

等价于依次执行 `npm run build:weapp` 和 `npm run upload`，编排脚本在 `config/release.js`。

也可以分开执行：

```bash
# 1. 编译小程序版本（产物在 dist/weapp/）
npm run build:weapp

# 2. 打包并上传到微信公众平台（生成一个「开发版本」）
npm run upload
```

> 注意：`npm run upload` 只上传、**不会编译**，直接跑它传的可能是 `dist/weapp/` 里的旧产物；日常更新用 `npm run release` 更稳。

**每次更新前修改版本号与说明**

在 `config/upload.js` 顶部的 `VERSION` / `DESC` 中修改：

```js
const VERSION = '1.0.0';  // 版本号，需在版本管理中与历史版本区分
const DESC = '首个版本';   // 本次更新说明
```

**上传之后**

代码此时只进入微信公众平台的「**开发版本**」，普通用户还搜不到，按需继续：

1. 「管理」→「版本管理」→ 开发版本 → 扫码真机预览，或点「选为体验版」后把体验版二维码发给体验成员
2. 需要全员可见：「提交审核」→ 审核通过后点「发布」

> **常见报错**
> - `errCode: -10008, errMsg: invalid ip: x.x.x.x` —— 该 IP 不在白名单，回「前置准备」第 2 步处理
> - `Wrong file format, only .png、.jpg、.jpeg format is supported` —— tabBar 图标只支持 PNG/JPG，不支持 SVG（源图是 `scripts/gen-tabbar-icons.js` 生成的 PNG，不要再往 `src/assets/tabbar/` 放 SVG）

---

## 其他命令

项目里 `scripts/` 下的工具都是**手动执行的开发期脚本**，没有挂进 `package.json`：

```bash
# 重新生成音效（改动合成参数后执行）
node scripts/gen-sounds.js

# 重新生成曲库（改 SPECS / HOOKS 后执行）
node scripts/gen-songs.js

# 重新生成 tabBar 图标（微信只支持 PNG）
node scripts/gen-tabbar-icons.js

# 校验图案轮廓与分格（改动 patternShapes.json 后必跑）
node scripts/preview-shapes.js [形状名]
# 参数：ASCII=1 看轮廓、DIVIDE=5 看分格

# 重新生成图案轮廓（改生成脚本里的图元组合后执行）
WRITE=1 node scripts/gen-pattern-shapes.js

# 卡片造型肉眼验收（圆盘 / 12 图案 / 方形卡，含「已点示例」看 ♪ 落痕）
node scripts/preview-cards.js   # 产出 docs/card-preview.html

# 真机视口（375×812）截图 / 点击验证（开发期自检用）
node scripts/cdp-shot.js "http://127.0.0.1:8899/#/pages/home/index" shot.png --wait=2200
# 可选：--clicks=1,2,3 依次点格子、--init=scripts/seed-save.js 预置进度、--full 截整页
```

---

## 开发流程

1. 修改代码后，预览服务会自动热更新
2. 如果预览服务没有自动更新，重新运行预览命令即可
3. 音效参数改动后需要重新运行 `gen-sounds.js`
4. 曲目改动后需要重新运行 `gen-songs.js`
5. 图案形状改动后需要运行 `preview-shapes.js` 验证（必查「连通块=1」与 3×3~8×8 全部可划分）
6. 提交前跑 `npx tsc --noEmit` 与 `npm run build:h5`，两者都必须干净

---

## 目录结构

```
shuerte/
├── AGENTS.md                  # AI 续写规范 + 模块进度台账（续写前先读）
├── docs/
│   ├── game.md                # 玩法文档：规则 / 关卡数值 / 星级 / 功能状态 / 里程碑
│   ├── game-design.md         # 早期游戏大纲
│   ├── design-v2.md           # v2 视觉与音乐系统方案
│   └── tech-plan.md           # 技术方案
├── scripts/                   # 生成与自检脚本（音效 / 曲库 / 图案 / 图标 / 预览 / 截图）
└── src/
    ├── app.config.ts          # 页面注册 + tabBar
    ├── app.tsx                # 启动时同步「音效 / 震动」设置到服务层
    ├── pages/
    │   ├── home/              # 首页（tabBar）：五线谱浮音、当前曲目、三卷进度
    │   ├── levels/            # 关卡（tabBar）：三卷签条、卷首进度、引子入口、关卡卡
    │   ├── mine/              # 我的（tabBar）：星星总览、统计、设置、清空记录
    │   ├── collection/        # 曲集（tabBar）：唱片列表、整曲回放、收录进度
    │   ├── game/              # 对局（核心，含引子模式）
    │   ├── result/            # 结算（核心）
    │   └── rank/              # 排行榜（占位）
    ├── components/            # GameGrid / GridCell / TimerRing / StarRating / LevelCard / Disc
    ├── hooks/useGameEngine.ts # 引擎状态机 + 副作用编排
    ├── utils/                 # gameEngine / circleLayout / silhouette / scoring / progress / shuffle / music / beats / format（纯函数）
    ├── services/              # audio / haptics / storage（平台能力封装）
    ├── store/useSaveStore.ts  # 存档 + 设置
    ├── data/                  # levels.ts（关卡蓝图与阈值表）、patternShapes.json（12 个图案的归一化多边形）、songs.ts、sounds.ts（生成文件）
    ├── styles/                # theme.scss（配色与格子色板）、variables.scss（间距 / 圆角 / 字体）
    └── assets/tabbar/         # tabBar 图标（仅 PNG）
```

---

## 架构与核心机制

**分层与数据流**（单向）：

```
玩家点击 → 页面调 tap() → utils/gameEngine 的纯函数算出新快照
        → React 重渲染 → 副作用（音效/震动/存档/跳结算）集中触发一次
```

- **逻辑与 UI 解耦**：`utils/gameEngine.ts` 是零 UI 依赖的纯函数状态机（`createGame` / `tapCell` / `pauseGame` / `resumeGame`），`utils/circleLayout.ts` 与 `utils/silhouette.ts` 是纯几何计算（圆盘扇环分区、图案轮廓与分格），都可单独测试
- **计时精度**：起点记录时间戳，显示值 = `now - startedAt - 暂停时长 + 罚时`，不使用定时器累加
- **渲染性能**：一次点击只变更 2 个格子对象的引用（其余格子 `React.memo` 直接跳过），计时刷新被隔离在 `TimerBar` 内部；卡片几何由 `useMemo` 缓存，形状不会每次重算
- **方形卡布局**：格位用百分比 + `padding-bottom` 撑正方形，只依赖容器宽度
- **圆形卡布局**：整块圆盘按半径分圈（第 k 圈 2k-1 格，1+3+5+…=n²）再按角度分格，每格用 `clip-path: polygon(圆心 + 圆弧)` 裁成扇形；渲染时**外圈先画、内圈后画**，内圈自然盖住外圈延伸到圆心的部分，就得到扇环。半径在弧线两端用 `smoothstep` 回落，扇环因此带圆角
- **图案卡布局**：12 个图案各由一组「圆 / 椭圆 / 胶囊 / 多边形」描述，构建期烘成一条归一化多边形存进 `patternShapes.json`；数字格在轮廓内部按 **Voronoi 划分**——先在轮廓里铺开一批均匀的格心（最远点采样 + Lloyd 松弛，且只落在离轮廓够远的「厚处」），再让每格从自己的格心向外生长，得到铺满轮廓的不规则多边形
- **图案卡三层渲染**：① 一张 SVG 画图案面、外轮廓和所有分割线（`stroke-width` 统一，所以线宽绝对均匀）；② 格子是**完全透明**的点击热区（`clip-path` 只用来命中）；③ 数字直接落在格心。于是图案就是「一整块面 + 一组线 + 数字」，没有格子纸片，也没有粗细不一的缝
- **图案分割线怎么来的**：直接从像素归属里提边（每条内部边只属于一对相邻格，天然只出现一次）→ Douglas-Peucker 拉直 → Chaikin 抹圆。**不能「每格多边形各画一遍」**：两格各自简化过，同一条边会变成两条错开的折线，画出来就是双线
- **SVG 以 data URI 内联**：小程序没有 `btoa`，base64 是自实现的；坐标系固定 `viewBox="0 0 100 100"`，1 单位 ≈ 6.9rpx
- **字号自适应**：格内字号用 `em` 相对卡片基准字号；圆形卡有按圈数收敛的字号档（44→22rpx），图案卡有按尺寸收敛的字号档（44→20rpx）——因为扇环沿半径方向很薄、轮廓内格子也比同尺寸规整网格小
- **限时机制**：引擎内 100ms 轮询当前用时（只读快照、不触发渲染），归零即判定失败并跳转失败结算

**存档字段**（Storage key：`shuerte_save`）：

```
stars        关卡 id → 最高星级
bestTimes    关卡 id → 最佳用时（ms）
bestErrors   关卡 id → 最少失误
bestRuns     关卡 id → 最好那一次的 { stars, elapsed, errors, beats[] }（beats 是击键节奏，供曲集回放）
totalGames / streakDays / lastPlayedDate
recent       最近 10 条成绩（仍记录，页面暂不展示，留给后续成就 / 分享）
tutorialDone 引子是否已通（老存档按「玩过」自动补齐）
settings     { sound, music, accompaniment, haptics, colorful, timbre }
```

> 成绩只升不降：星级更高、同星级用时更短、再比失误少，才会覆盖 `bestRuns`。打崩了不会冲掉最好记录，所以可以放心反复重玩。

**音效实现**：4 个音效由 `scripts/gen-sounds.js` 用 Node 合成 WAV（正弦波 + 包络），内联为 base64 写入 `src/data/sounds.ts`，因此项目不依赖任何外部音频文件。H5 端直接播放 data URI；小程序端 `InnerAudioContext` 不支持 data URI，会把 base64 落地到 `USER_DATA_PATH` 再播放。

**演奏音实现**：`services/audio.ts` 用 WebAudio 实时合成（3 种音色的包络 / 谐波参数），不占用任何音频资源；音高由 `utils/music.ts` 从「数字 → 乐谱位置」映射而来，倒序关只反排数字不反排乐谱，所以听感始终是正着走的旋律。双色关的旋律轨与低音轨**各有各的指针**——共用一个下标会让旋律每隔一个音就断一次。

**伴奏实现**：`services/accompaniment.ts` 只算数据（低音 / 铺底 / 琶音 / 轻击四个声部的相对偏移与包络），排程由 `audio.ts` 的 `scheduleVoice` 完成，两条总线（旋律 0.90 / 伴奏 0.55）汇进同一个限幅器。回放时旋律与伴奏走**同一个 lookahead 循环**，时间轴由 `barTimes[b] = noteTimes[b * 4]` 对齐到玩家的真实击键节奏，不做量化——量化会让「回放我的演奏」变成「另一个人弹的」。

> 调度用**墙钟**决定「该排哪些事件」，用 `ctx.currentTime` 决定「什么时候响」。反过来用音频时钟算 horizon，在上下文被挂起时会死锁（`currentTime` 冻结，整首曲子卡在第一个音）。

> Taro H5 的 Storage 是双层包装：`localStorage[key] = JSON.stringify({ data: JSON.stringify(save) })`，写种子存档脚本时注意这一层。

---

## 常见改动指引

| 我要做的事 | 改哪里 |
| --- | --- |
| 加关卡 / 加一卷 | `src/data/levels.ts` 的 `TIER_BLUEPRINTS`（关卡自动生成；改 `title` 即改卷名、`starGate` 即改开卷门槛） |
| 改引子（指引关） | `src/data/levels.ts` 的 `GUIDE_LEVEL`（尺寸 / 曲目 / 限时）+ `src/pages/game/index.tsx` 的 `buildGuideHint`（提示语） |
| 改解锁规则 | `src/utils/progress.ts` 的 `isLevelUnlocked` / `isChapterUnlocked` / `findCurrentLevel` |
| 新增玩法（倒序 / 双色 / 变位） | `src/types/game.ts` 加 `mode` 字段 → `levels.ts` 配置 → 引擎目标推进策略 |
| 调整圆形分区 | `src/utils/circleLayout.ts` 的 `buildCircleCells` |
| 调整某个图案的造型 | **改生成脚本** `scripts/gen-pattern-shapes.js` 里对应 key 的 `parts`（`C` 圆 / `E` 椭圆 / `K` 胶囊 / `P` 多边形，配 `ring()` / `spikes()` 批量摆放）→ `WRITE=1 node scripts/gen-pattern-shapes.js` 落盘 → 跑 `node scripts/preview-shapes.js <形状名>` 验证（`ASCII=1` 看轮廓、`DIVIDE=5` 看分格；必须保证「连通块=1」且 3×3~8×8 都能划分）。**不要手改 `patternShapes.json`** |
| 调整图案出场顺序 / 尺寸配对 | `scripts/gen-pattern-shapes.js` 顶部的 `ORDER` 数组（必须与 `DESIGNS` 一一对应，脚本会校验），改完重新生成 json |
| 调整图案线宽 | `src/utils/silhouette.ts` 的 `PATTERN_LINE_WIDTH`（格线 0.36 ≈ 2.5rpx ≈ 1.2px）与 `PATTERN_OUTLINE_WIDTH`（外轮廓 0.85），单位是 viewBox 的 100（1 单位 ≈ 6.9rpx）。**外轮廓必须明显粗于格线**，否则真机上图案边界立不住；但格线细于 0.3 会发虚，外轮廓粗过 1.0 又开始「卡片化」 |
| 调整图案字号 | `src/components/GameGrid/index.module.scss` 的 `pattern3~8` |
| 调整图案卡配色 | `src/styles/theme.scss` 的 `$color-pattern-face` / `$color-pattern-line`（SVG 拿不到 SCSS 变量，这两个值要同步到 `silhouette.ts` 的常量） |
| 调整限时松紧 | `src/data/levels.ts` 的 `SIZE_TIME_LIMITS`（口径 = `SIZE_THRESHOLDS.silver × 1.15`），想整体放宽就改系数并重算全表 |
| 调整星级阈值 | `src/data/levels.ts` 的 `SIZE_THRESHOLDS`；收紧系数在 `cycleFactor`，极速档在 `PLATINUM_RATIO` |
| 换配色 / 加背景图案 | `src/styles/theme.scss` |
| 调整提示音 | `scripts/gen-sounds.js` 参数后重新运行（勿手改 `data/sounds.ts`） |
| 调整曲目 | `scripts/gen-songs.js` 的 `SPECS` / `HOOKS` 后重新运行（勿手改 `data/songs.ts`） |
| 换 tabBar 图标 | 改 `scripts/gen-tabbar-icons.js` 后重新运行（微信只支持 PNG，不要提交 SVG） |
| 加设置项 | `types/game.ts` → `store` 的 `initialData` → `pages/mine` UI → `app.tsx` 同步 |
| 新增页面 | 新建 `pages/<name>/{index.tsx,index.module.scss,index.config.ts}` 并注册进 `app.config.ts` |

更详细的约束、常量联动表、质量门禁与决策记录见 **[AGENTS.md](./AGENTS.md)**。

---

## 已知限制

- 成绩仅保存在本机，换设备会丢失（云端同步属 M3）
- 真机手感（震动强度、音效音量、手指点击命中率）尚未完整验证，建议扫码真机复验
- 图案卡的分格与线条是**构建期算好缓存**的：改 `silhouette.ts` 的几何参数后，需重启预览或清缓存才能看到效果
- 项目名仍为模板默认的 `taro_template`，若需改名请同步 `package.json` 的 `name` 与 `config/index.ts` 的 `projectName`
- `src/services/cloud.ts` 为模板预置的云调用封装，M1 无后端未使用
- `dist/` 已提交进仓库（用于 Vercel 直接部署），改动源码后需重新构建再提交，否则线上会是旧产物

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/game.md`](./docs/game.md) | **玩法文档**：规则、卷位与卡片造型、星级规则、关卡数值表、功能状态、里程碑、玩家可能遇到的问题 |
| [`AGENTS.md`](./AGENTS.md) | 续写规范与进度台账：分层职责、模块进度、常量联动、编码规范、改动指引、自查清单、决策记录 |
| [`docs/game-design.md`](./docs/game-design.md) | 早期游戏大纲：游戏模块、关卡设计、通关规则、奖励机制、留存设计、新手 60 秒脚本 |
| [`docs/design-v2.md`](./docs/design-v2.md) | v2 视觉与音乐系统改版方案与决策记录 |
| [`docs/tech-plan.md`](./docs/tech-plan.md) | 技术方案：选型、目录分层、核心模块设计、性能与扩展性、里程碑 |

