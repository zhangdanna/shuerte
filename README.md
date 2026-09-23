# 舒尔特方格闯关小游戏（shuerte）

> 用最短时间按顺序点完 N×N 方格里的数字，逐关进阶的专注力训练小游戏。微信小程序（同时可编译为 H5 预览与传播）。

**当前版本 v0.1.0 · M1（MVP 可玩）已完成**，端到端功能已验证；排行榜为占位页，成就/每日挑战/主题换肤在下一阶段。

---

## 玩法

1. **三档难度**：初级 / 高级 / 困难，每档 12 关，共 36 关
2. **尺寸逐关递增**：每档内第 1 关 3×3（9 个数字）、第 2 关 4×4……到 8×8（64 个数字），走完一遍后尺寸重来一次、但时间标准更紧
3. **每关都有限时**：倒计时归零仍未点完 → 挑战失败，本关必须重打，不能跳到下一关
4. 3-2-1 倒计时结束后开始计时，界面同时显示「剩余时间」与「实际用时」
5. 按顺序点击 1 → N²，顶部常驻显示当前目标数字与「已完成 x / N」
6. 点对：清脆「叮」+ 一次点击动效（**不改变格子底色**）
7. 点错：低沉「嗡」+ 震动 + 格子红闪 + 失误 +1 + **罚时 1.5 秒**（罚时直接吃掉剩余时间）
8. 点完最后一个数字 → 结算评级

### 难度递进：档位 × 卡片造型

| 档位 | 卡片造型 | 格子排布 | 解锁条件 |
| --- | --- | --- | --- |
| **初级** | 方形卡 | 常规方块网格 | 默认解锁 |
| **高级** | 圆形卡 | **整块圆盘按半径分圈、角度分格**，格子是扇环，沿圆边排一圈 | 累计 8 星 |
| **困难** | 生肖卡 | **整张卡是生肖轮廓**（12 生肖依次出场），数字格在轮廓内按 Voronoi 划分成不规则多边形 | 累计 16 星 |

- 每一档内部：尺寸 3×3 → 8×8 走两遍，第二遍星级阈值与限时同步收紧 3%（最低 70%）
- 颜色：数字与格底按同一色号成对循环（红字红底、蓝字蓝底……共 6 组），底色压到极浅保证数字清晰
- 图案只属于**整张卡片**；单个数字格只有数字与浅色底，不叠加任何图案

> 说明：界面上只呈现「初级/高级/困难」三档难度，卡片造型是各档的固定皮肤，不作为分类展示。

### 星级规则

| 条件 | 星级 |
| --- | --- |
| 用时 ≤ 3 星阈值 | 3 星 |
| 用时 ≤ 2 星阈值 | 2 星 |
| 完成（未达标） | 1 星 |
| **0 失误** | 额外 +1 星（上限 3 星） |

「手速」和「精准」是两条并行的追求路线：手快能拿 3 星，零失误同样能拿 3 星。

### 关卡与数值

每档 12 关（尺寸阶梯走两遍），三档共 36 关。

按尺寸的星级阈值与限时（基准值，档内每循环收紧 3%）：

| 尺寸 | 3 星 | 2 星 | 限时 |
| --- | --- | --- | --- |
| 3×3 | 6.0″ | 9.0″ | 15″ |
| 4×4 | 12.0″ | 18.0″ | 25″ |
| 5×5 | 25.0″ | 36.0″ | 40″ |
| 6×6 | 42.0″ | 58.0″ | 60″ |
| 7×7 | 65.0″ | 88.0″ | 85″ |
| 8×8 | 95.0″ | 125.0″ | 115″ |

- 阈值口径参考舒尔特方格训练标准：5×5 成人熟练约 20 秒、达标约 30 秒，限时给到 2 星阈值的 1.5 倍左右
- 满星 108 颗（36 关 × 3 星）；档内顺序解锁（1 星即可推进），跨档用累计星星做门槛
- 已解锁关卡可无限重挑战，只记录最好成绩

> 注意：旧版本存档的关卡结构不同（曾为 6 关 / 10 轮结构），本次调整后可能错位，在「我的 → 清空记录」重置一次即可。

---

## 功能状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 对局核心（倒计时/判错/罚时/暂停） | ✅ | 暂停时冻结计时；切后台自动暂停 |
| 计时 | ✅ | 时间戳差值计算，定时器仅刷新显示 |
| 音效 | ✅ | 4 个音效：倒计时、点对、点错、通关 |
| 震动反馈 | ✅ | 仅点错与通关触发（可关闭） |
| 星级结算 | ✅ | 星级动画、破纪录标记、挑战下一关 |
| 关卡数量 | ✅ | 三档 × 12 关 = 36 关，尺寸阶梯 × 档位造型，程序化生成 |
| 每关限时 | ✅ | 按尺寸查表；倒计时归零即失败，失败不记档、不能跳关 |
| 卡片造型 | ✅ | 初级方形卡 / 高级圆形卡（圆盘分区·扇环格）/ 困难生肖卡（整卡生肖轮廓 + 轮廓内 Voronoi 分格·墨色线稿风，12 生肖依次出场） |
| 彩色数字与底色 | ✅ | 6 组「浅色底 + 同色系数字」成对循环，页面柔光背景，点对不改底色只播动效 |
| 本地存档 | ✅ | 星级、最佳用时、最近成绩、连续天数 |
| 关卡地图 | ✅ | 三档等分标签、每档 12 关、锁态与解锁提示 |
| 首页 / 我的 | ✅ | 数据总览、设置项、清空记录 |
| 排行榜 | ⬜ 占位页 | M3 云端实现 |
| 每日挑战 / 成就 / 主题换肤 / 通关特效 | ⬜ 未开始 | 见「里程碑」 |
| 倒序 / 双色 / 静默变位等玩法 | ⬜ 未开始 | 引擎已为配置化扩展预留结构 |

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Taro 4.1.9 + React 18 + TypeScript 5 |
| 样式 | Sass + CSS Modules（设计稿基准 750rpx，代码统一写 rpx） |
| 状态 | zustand（含 persist，同步存储到 Taro Storage） |
| 工具 | classnames、dayjs |
| 平台能力 | `Taro.createInnerAudioContext`（音效）、`Taro.vibrateShort`（震动）、`Taro.setStorageSync`（存档） |
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
node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\preview-server.js" d:\working\play\shuerte
```

预览服务会输出 `[TraePreviewUrl]`，在浏览器中打开即可实时查看。预览页面支持配置微信/支付宝/抖音小程序凭证，点击「生成二维码」后可直接扫码真机预览、上传代码、跳转提审发布。

> 注意：不要删除 `.pai/pai-preview-server.lock`，它用于复用端口；删除后预览链接会失效。

### H5预览

```bash
npm run dev:h5
```
### 编译为 H5（用于部署或分享）

```bash
# 编译 H5 版本
npm run build:h5
# 或
yarn build:h5
```

编译产物在 `dist/h5` 目录，可直接部署到静态服务器。

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

### 方式二：微信小程序发布

### 编译并上传微信小程序（miniprogram-ci）

小程序代码上传走 **`miniprogram-ci`** 命令行方式，脚本已就绪：`config/upload.js`。

**前置准备（一次性）**

1. 在[微信公众平台](https://mp.weixin.qq.com) →「开发」→「开发管理」→「开发设置」→「小程序代码上传」中生成并下载**代码上传密钥**，保存为项目根目录的 `private.wx.key`（已被 `.gitignore` 的 `*.key` 规则忽略，不会提交到仓库）
2. 同一位置配置 **IP 白名单**：把执行上传的机器公网 IP 加入白名单；若 IP 不固定（家庭/公司宽带），建议直接关闭白名单校验
3. 确认 `config/upload.js` 中的 `appid` 与目标小程序一致，并按需修改 `version` / `desc`

**编译 + 上传**

```bash
# 1. 编译小程序版本（产物在 dist/weapp/）
npm run build:weapp

# 2. 打包并上传到微信公众平台（生成一个「开发版本」）
npm run upload
```

`npm run upload` 等价于 `node config/upload.js`：它会读取 `dist/weapp/`、用 `private.wx.key` 签名后上传，日志出现 `上传成功: {...}` 即完成。

**上传之后**

代码此时只进入微信公众平台的「**开发版本**」，普通用户还搜不到，按需继续：

1. 「管理」→「版本管理」→ 开发版本 → 扫码真机预览，或点「选为体验版」后把体验版二维码发给体验成员
2. 需要全员可见：「提交审核」→ 审核通过后点「发布」

> **常见报错**
> - `errCode: -10008, errMsg: invalid ip: x.x.x.x` —— 该 IP 不在白名单，回「前置准备」第 2 步处理
> - `Wrong file format, only .png、.jpg、.jpeg format is supported` —— tabBar 图标只支持 PNG/JPG，不支持 SVG

---

## 其他命令

```bash
# 重新生成音效（改动合成参数后执行）
node scripts/gen-sounds.js

# 校验生肖轮廓与分格（改动 zodiacShapes.json 后必跑）
node scripts/preview-shapes.js [形状名]
# 参数：ASCII=1 看轮廓、DIVIDE=5 看分格
```

## 开发流程

1. 修改代码后，预览服务会自动热更新
2. 如果预览服务没有自动更新，重新运行预览命令即可
3. 音效参数改动后需要重新运行 `gen-sounds.js`
4. 生肖形状改动后需要运行 `preview-shapes.js` 验证

---

## 目录结构

```
shuerte/
├── AGENTS.md                  # AI 续写规范 + 模块进度台账（续写前先读）
├── docs/
│   ├── game-design.md         # 游戏大纲
│   └── tech-plan.md           # 技术方案
├── scripts/gen-sounds.js      # 音效合成脚本（生成 src/data/sounds.ts）
└── src/
    ├── app.config.ts          # 页面注册 + tabBar
    ├── app.tsx                # 启动时同步「音效/震动」设置到服务层
    ├── pages/
    │   ├── home/              # 首页（tabBar）：总览、继续挑战、最近成绩
    │   ├── levels/            # 关卡（tabBar）：章节切换、关卡网格
    │   ├── mine/              # 我的（tabBar）：统计、设置、清空记录
    │   ├── game/              # 对局（核心）
    │   ├── result/            # 结算（核心）
    │   └── rank/              # 排行榜（占位）
    ├── components/            # GameGrid / GridCell / TimerBar / StarRating / LevelCard
    ├── hooks/useGameEngine.ts # 引擎状态机 + 副作用编排
    ├── utils/                 # gameEngine / circleLayout / silhouette / scoring / progress / shuffle / format（纯函数）
    ├── services/              # audio / haptics / storage（平台能力封装）
    ├── store/useSaveStore.ts  # 存档 + 设置
    ├── data/                  # levels.ts（关卡蓝图与阈值表）、zodiacShapes.json（12 生肖的椭圆并集）、sounds.ts（生成文件）
    ├── styles/                # theme.scss（配色与格子色板）、variables.scss（间距/圆角/字体）
    └── assets/tabbar/         # tabBar 图标
```

---

## 架构与核心机制

**分层与数据流**（单向）：

```
玩家点击 → 页面调 tap() → utils/gameEngine 的纯函数算出新快照
        → React 重渲染 → 副作用（音效/震动/存档/跳结算）集中触发一次
```

- **逻辑与 UI 解耦**：`utils/gameEngine.ts` 是零 UI 依赖的纯函数状态机（`createGame` / `tapCell` / `pauseGame` / `resumeGame`），`utils/circleLayout.ts` 与 `utils/silhouette.ts` 是纯几何计算（圆盘扇环分区、生肖轮廓与分格），都可单独测试
- **计时精度**：起点记录时间戳，显示值 = `now - startedAt - 暂停时长 + 罚时`，不使用定时器累加
- **渲染性能**：一次点击只变更 2 个格子对象的引用（其余格子 `React.memo` 直接跳过），计时刷新被隔离在 `TimerBar` 内部；卡片几何由 `useMemo` 缓存，形状不会每次重算
- **方形卡布局**：格位用百分比 + `padding-bottom` 撑正方形，只依赖容器宽度
- **圆形卡布局**：整块圆盘按半径分圈（第 k 圈 2k-1 格，1+3+5+…=n²）再按角度分格，每格用 `clip-path: polygon(圆心 + 圆弧)` 裁成扇形；渲染时**外圈先画、内圈后画**，内圈自然盖住外圈延伸到圆心的部分，就得到扇环
- **生肖卡布局**：整张卡用 `clip-path` 裁成生肖轮廓（12 生肖各由一组椭圆并集描述，运行时追踪边界、平滑、简化成 polygon）；数字格在轮廓内部按 **Voronoi 划分**——先在轮廓里铺开一批均匀的格心（最远点采样 + Lloyd 松弛），再让每格从自己的格心向外生长，得到紧贴拼合并铺满轮廓的不规则多边形。卡片底色是墨色，格子向形心收缩留缝，缝隙露出的墨色就成了轮廓勾边与格线
- **字号自适应**：格内字号用 `em` 相对卡片基准字号；圆形卡有按圈数收敛的字号档（44→22rpx），生肖卡有按尺寸收敛的字号档（40→16rpx）——因为扇环沿半径方向很薄、轮廓内格子也比同尺寸规整网格小
- **限时机制**：引擎内 100ms 轮询当前用时（只读快照、不触发渲染），归零即判定失败并跳转失败结算

**存档字段**（Storage key：`shuerte_save`）：

```
stars        关卡 id → 最高星级
bestTimes    关卡 id → 最佳用时（ms）
bestErrors   关卡 id → 最少失误
totalGames / streakDays / lastPlayedDate
recent       最近 10 条成绩
settings     { sound, haptics }
```

**音效实现**：4 个音效由 `scripts/gen-sounds.js` 用 Node 合成 WAV（正弦波 + 包络），内联为 base64 写入 `src/data/sounds.ts`，因此项目不依赖任何外部音频文件。H5 端直接播放 data URI；小程序端 `InnerAudioContext` 不支持 data URI，会把 base64 落地到 `USER_DATA_PATH` 再播放。

---

## 常见改动指引

| 我要做的事 | 改哪里 |
| --- | --- |
| 加关卡 / 加难度档 | `src/data/levels.ts` 的 `TIER_BLUEPRINTS`（关卡自动生成） |
| 新增玩法（倒序 / 双色 / 变位） | `src/types/game.ts` 加 `mode` 字段 → `levels.ts` 配置 → 引擎目标推进策略 |
| 调整圆形分区 | `src/utils/circleLayout.ts` 的 `buildCircleCells` |
| 调整某个生肖的造型 | `src/data/zodiacShapes.json` 里改椭圆，然后跑 `node scripts/preview-shapes.js <形状名>` 验证（`ASCII=1` 看轮廓、`DIVIDE=5` 看分格；必须保证「连通块=1」且 3×3~8×8 都能划分） |
| 调整生肖卡墨线粗细 / 字号 | `src/utils/silhouette.ts` 的 `CELL_INSET_FACTOR` + `src/components/GameGrid/index.module.scss` 的 `silhouette3~8` |
| 换配色 / 加背景图案 | `src/styles/theme.scss` |
| 调整音效 | `scripts/gen-sounds.js` 参数后重新运行（勿手改 `data/sounds.ts`） |
| 加设置项 | `types/game.ts` → `store` 的 `initialData` → `pages/mine` UI → `app.tsx` 同步 |
| 新增页面 | 新建 `pages/<name>/{index.tsx,index.module.scss,index.config.ts}` 并注册进 `app.config.ts` |

更详细的约束、常量联动表、质量门禁与决策记录见 **[AGENTS.md](./AGENTS.md)**。

---

## 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| **M1 · MVP** | 36 关核心玩法（三档难度、尺寸 3×3 → 8×8、三种卡片造型与分区布局）、计时判错、音效、星级结算、本地存档、关卡地图 | ✅ 已完成 |
| **M2 · 表现层** | 每日挑战、通关特效、主题换肤与背景图案、成就系统、双路线评级 | ⬜ |
| **M3 · 社交化** | 云端排行榜（服务端校验成绩）、分享海报、连胜签到、更多难度档与混合玩法 | ⬜ |

---

## 已知限制

- 成绩仅保存在本机，换设备会丢失（云端同步属 M3）
- 真机手感（震动强度、音效音量、手指点击命中率）尚未验证，建议扫码真机复验
- 项目名仍为模板默认的 `taro_template`，若需改名请同步 `package.json` 的 `name` 与 `config/index.ts` 的 `projectName`
- `src/services/cloud.ts` 为模板预置的云调用封装，M1 无后端未使用

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| `AGENTS.md` | 续写规范与进度台账：分层职责、模块进度、常量联动、编码规范、改动指引、自查清单、决策记录 |
| `docs/game-design.md` | 游戏大纲：游戏模块、关卡设计、通关规则、奖励机制、留存设计、新手 60 秒脚本 |
| `docs/tech-plan.md` | 技术方案：选型、目录分层、核心模块设计、性能与扩展性、里程碑 |
