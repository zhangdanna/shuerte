# 舒尔特方格闯关小游戏 · AI 开发规范与进度台账

> **用途**：每次续写前先读这一份，30 秒掌握项目全貌、分层约束与当前进度。
> **最后更新**：2026-09-21 ｜ **当前阶段**：M1（MVP 可玩）已完成并端到端验证

---

## 0. 续写流程（AI 必读）

1. 读本文档 → 看 §3「模块进度台账」确认要做什么
2. 看 §2「分层职责」与 §5「编码规范」确认代码该落在哪一层
3. 动手改代码
4. **回到本文档更新**：§3 台账状态、§9 变更日志、§7 自查结果
5. 若文档与代码冲突 → **以代码为准**，并立即修正本文档

**唯一允许的执行方式**（其余构建/预览命令一律不要用）：

| 目的 | 命令 |
| --- | --- |
| 启动 / 刷新预览 | `node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\preview-server.js" d:\working\play\shuerte` |
| 重新生成音效 | `node scripts/gen-sounds.js` |
| 获取技能资产目录 | `node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\get-skill-assets-dir.js"` |
| 校验生肖轮廓与分格 | `node scripts/preview-shapes.js [形状名]`（`ASCII=1` 看轮廓、`DIVIDE=5` 看分格；改了 `zodiacShapes.json` 必跑） |

约定：
- 预览服务**非阻塞后台运行**，输出 `[TraePreviewUrl]` 后必须用 `OpenPreview` 打开
- 代码改动后**重新调用 preview-server.js**（已运行时它会自动触发更新，端口复用）
- **严禁删除** `.pai/pai-preview-server.lock`（删了端口会变，旧预览链接失效）
- **禁止**执行 `npm run build:*` / `taro build` / 任何 Taro、NPM 命令；禁止引导使用外部开发者工具

---

## 1. 项目速览

| 项 | 内容 |
| --- | --- |
| 形态 | 微信小程序（同时可编译 H5 用于预览与传播） |
| 玩法 | N×N 方格乱序填入 1..N²，按顺序点击，计时 + 失误罚时 + 星级评定；每关有限时，超时即失败 |
| 卡片造型 | 方形（常规网格）/ 圆形（整块圆盘扇环分区）/ 生肖（整张卡裁成 12 生肖轮廓、格子是轮廓内 Voronoi 划分），作为难度档的皮肤 |
| 技术栈 | Taro 4.1.9 + React 18 + TypeScript 5 + Sass（CSS Modules）+ zustand + dayjs + classnames |
| 设计稿基准 | 750rpx（`config/index.ts` 的 `designWidth: 375`，**代码里统一写 rpx**） |
| 数据 | 纯本地，无后端、无登录、不涉及云开发 |
| 进度 | M1 完成（36 关：初级/高级/困难 三档 × 12 关，尺寸 3×3→8×8 × 卡片造型 方形/圆形/生肖，每关限时、计时、音效、存档、星级结算）；M2/M3 见 §3 |

---

## 2. 目录与分层职责

| 层 | 路径 | 职责 | 禁止 |
| --- | --- | --- | --- |
| 页面 | `src/pages/<name>/` | 组装组件、页面级交互 | 写游戏规则、算星级 |
| 组件 | `src/components/<Name>/` | 纯展示，props 驱动 | 读写存档、直接调 Taro API |
| 逻辑 | `src/utils/` | 纯函数（引擎/计分/进度/格式化） | 碰 UI、碰平台 API，必须是可单测的纯函数 |
| 服务 | `src/services/` | 平台能力封装（音频/震动/存储） | 写业务规则 |
| 数据 | `src/data/` | 关卡配置、音效资源 | 写逻辑 |
| 状态 | `src/store/useSaveStore.ts` | 存档 + 设置（zustand persist） | 存派生值（星星总数是 select 出来的） |
| Hook | `src/hooks/useGameEngine.ts` | 引擎状态机 + 副作用编排 | 直接改 state 对象（必须走不可变快照） |

**数据流**（单向，别破坏它）：

```
玩家点击 → pages/game 调 tap() → useGameEngine 调 tapCell()（纯函数）
        → 产出新 GameState 快照 → React 重渲染
        → 副作用（音效 / 震动 / 结束回调→通关写存档→跳结算）在此处集中触发一次
限时：useGameEngine 内 100ms 轮询 getElapsed（只读快照、不触发渲染），归零 → failByTimeout → 跳失败结算
```

页面清单（`app.config.ts` 为准）：

| 页面 | 路径 | 类型 | 状态 |
| --- | --- | --- | --- |
| 首页 | `pages/home/index` | tabBar | ✅ 完整 |
| 关卡 | `pages/levels/index` | tabBar | ✅ 完整 |
| 我的 | `pages/mine/index` | tabBar | ✅ 完整 |
| 对局 | `pages/game/index` | 二级（核心） | ✅ 完整 |
| 结算 | `pages/result/index` | 二级（核心） | ✅ 完整 |
| 排行榜 | `pages/rank/index` | 二级 | ⬜ 占位页（M3 实现） |

---

## 3. 模块进度台账（每次改动后更新此表）

### 3.1 已完成

| 模块 | 文件 | 状态 | 说明 |
| --- | --- | --- | --- |
| 对局引擎 | `utils/gameEngine.ts` | ✅ 完成 | 纯函数状态机：建局/倒计时/判错/限时失败/暂停/恢复/冻结用时 |
| 计分规则 | `utils/scoring.ts` | ✅ 完成 | 星级 + 罚时换算 |
| 关卡生成器 | `data/levels.ts` | ✅ 完成 | 3 档 × 12 关 = 36 关，程序化生成；难度档 = 分类，卡片造型是档位皮肤（不在 UI 展示） |
| 卡片分区几何 | `utils/circleLayout.ts` + `utils/silhouette.ts` | ✅ 完成 | 纯计算：圆形卡扇环（半径分圈 × 角度分格）；生肖卡轮廓追踪 + Voronoi 分格 |
| 限时与失败 | `data/levels.ts` + `utils/gameEngine.ts` + `hooks/useGameEngine.ts` | ✅ 完成 | 每关按尺寸查限时表；倒计时归零即失败，不记成绩、不解锁下一关 |
| 配色系统 | `styles/theme.scss` + `components/GridCell` | ✅ 完成 | 6 组「浅色底 + 同色系数字」成对循环；圆形卡青灰绿、生肖卡墨色线稿；页面柔光背景 |
| 生肖主题 | `data/zodiacShapes.json` + `utils/silhouette.ts` | ✅ 完成 | 12 生肖各由「椭圆并集」描述，运行时自动生成轮廓；整张卡裁成生肖形状，格子是轮廓内 Voronoi 划分出的不规则多边形 |
| 解锁逻辑 | `utils/progress.ts` | ✅ 完成 | 章内顺序解锁 + 跨章星星门槛 |
| 引擎 Hook | `hooks/useGameEngine.ts` | ✅ 完成 | 倒计时、点击副作用、切后台暂停 |
| 卡片与格子 | `components/GameGrid` + `GridCell` | ✅ 完成 | 三种布局分发（方形网格 / 圆形扇环 / 生肖轮廓内 Voronoi 格）；格子用 clip-path 描述形状；字号 em 相对卡片基准字号自动适配；点对只播动效不改底色 |
| 计时显示 | `components/TimerBar` | ✅ 完成 | 50ms 刷新被隔离在组件内部 |
| 星级展示 | `components/StarRating` | ✅ 完成 | sm/md/lg + 结算页弹出动画 |
| 关卡卡片 | `components/LevelCard` | ✅ 完成 | 尺寸徽标 + 星级 + 最佳用时 + 锁态/当前高亮 |
| 音效 | `services/audio.ts` + `data/sounds.ts` | ✅ 完成 | 4 个音效（tick/click/error/success），base64 内联 |
| 震动 | `services/haptics.ts` | ✅ 完成 | 仅失误与通关触发 |
| 存档 | `store/useSaveStore.ts` + `services/storage.ts` | ✅ 完成 | zustand persist，key = `shuerte_save` |
| 首页 | `pages/home/index` | ✅ 完成 | 星星总数、连续天数、继续挑战、最近 5 条成绩 |
| 关卡地图 | `pages/levels/index` | ✅ 完成 | 3 档等分标签（初级/高级/困难）、每档 12 关（两列）、锁态与解锁提示 |
| 对局页 | `pages/game/index` | ✅ 完成 | HUD（目标 + 剩余/用时 + 倒计时条）、遮罩、暂停面板、限时失败跳转、参数校验 |
| 结算页 | `pages/result/index` | ✅ 完成 | 通关：星级动画 + 破纪录 + 挑战下一关；失败：用时/失误/完成度，只能重打 |
| 我的页 | `pages/mine/index` | ✅ 完成 | 统计、音效/震动开关、清空记录 |
| 全局配置 | `app.config.ts` / `styles/theme.scss` / 6 个 tabBar 图标 | ✅ 完成 | 青绿主题 |

### 3.2 未开始 / 待办（按建议优先级）

| 待办 | 所属里程碑 | 落点 | 备注 |
| --- | --- | --- | --- |
| 每日挑战（日期哈希种子，全员同题） | M2 | `utils/shuffle.ts` 加 seed 参数、`utils/gameEngine.ts` 传入 | 回访率最高的一步 |
| 通关特效（格子依次消隐 + 粒子） | M2 | `pages/result` + 新组件 `ParticleLayer` | 能用 CSS 就不用 Canvas |
| 主题换肤 / 背景图案 | M2 | `styles/theme.scss` + `ThemeProvider` 组件 + 存档加 `settings.theme` | 变量已预留结构 |
| 成就系统（6 枚徽章） | M2 | 新建 `utils/achievements.ts` + `data/achievements.ts` | 存档需加 `achievements: string[]` |
| 新玩法：倒序 / 双色交替 / 静默变位 | M2 | `types/game.ts` 加 `mode`，`data/levels.ts` 配置，引擎推进策略 | 当前只有正序 |
| 双路线反馈（速度评级 / 精准评级） | M2 | `pages/result` | 给玩家第二个进步维度 |
| 排行榜（云端） | M3 | 新建 `services/rank.ts`（接口占位）+ `pages/rank` | 需服务端校验成绩时间戳防作弊 |
| 分享海报 | M3 | `pages/result` | |
| 第 4 章「挑战」（混合玩法） | M3 | `data/levels.ts` 新增轮次 + `types/game.ts` 加 `mode` | 已在无限轮次里预留位置，依赖新模式先落地 |

### 3.3 验证状态

| 项 | 状态 |
| --- | --- |
| 浏览器端到端（首页→对局→倒计时→点对/点错→暂停→结算→存档回显） | ✅ 8/8 通过 |
| 关卡尺寸阶梯 / 彩色数字 / 浅色底 / 三种图案形态 | ✅ 9/9 通过（3×3 方形、5×5 圆形、7×7 生肖） |
| 无限关卡 / 限时倒计时 / 超时失败 / 卡片造型 × 尺寸组合 | ✅ 9/9 通过（60 关生成、剩余+用时双计时、点对不改底色、超时失败不记档且无「下一关」、圆形卡内接网格、生肖卡小格无图案） |
| 三档分类 / 圆形卡圆盘分区 / 生肖卡轮廓内不规则格 | ✅ 7/7 通过（分类仅 初级/高级/困难、9 格呈 1+3+5 半径分组、36 格数字 1~36 无重复、生肖 9 格 clip-path 互不相同、方形卡无 clip-path、扇环点击命中、无编译错误） |
| 生肖卡重构（12 生肖轮廓 + 轮廓内 Voronoi 分格 + 墨色线稿） | ✅ 12/12 读图核验 + 交互核验（`node scripts/preview-shapes.js` 确认 12 形状全部单连通、面积 22%~45%、3×3~8×8 共 72 种组合全部划分成功且最小格 ≥19rpx；浏览器实测卡片底色 `rgb(47,47,51)`、3×3 有 9 格 / 8×8 有 64 格且 clip-path 互不相同、点击推进目标 1→2、圆形卡 9 格未受影响；用 qianwen-vision 读截图，12 生肖中 11 个「清晰可辨」、虎为「猫科动物」） |
| 控制台报错 | ✅ 无阻断性报错（仅有 Taro 运行时未就绪时丢弃一条日志的 warn） |
| 真机（手指点击手感、震动、音效实际播放） | ⬜ **未验证**，下次改动建议扫码真机复验 |

---

## 4. 关键常量与数据契约

**改这些值前先看「联动影响」列。**

| 常量 | 值 | 位置 | 联动影响 |
| --- | --- | --- | --- |
| `COUNTDOWN_SECONDS` | 3 | `utils/gameEngine.ts` | 开局倒计时秒数，改完检查对局页遮罩文案 |
| `ERROR_PENALTY` | 1500 ms | `utils/scoring.ts` | 罚时；对局页 footer 文案「每次罚时 1.5s」写死了数字，需同步 |
| `ERROR_FLASH_MS` | 420 ms | `utils/gameEngine.ts` | 错误格子红闪时长；与 `GridCell` 的 `cellShake` 动画时长（0.3s）相关联 |
| `RECENT_LIMIT` | 10 | `store/useSaveStore.ts` | 存档保留最近成绩条数；首页只展示 5 条 |
| `TICK_INTERVAL` | 50 ms | `components/TimerBar/index.tsx` | 计时刷新频率 |
| `SAVE_STORAGE_KEY` | `'shuerte_save'` | `services/storage.ts` | **改名字 = 老用户存档全部丢失**；加字段请走 persist `version` + migrate |
| `SIZE_THRESHOLDS` | 3~8 每尺寸一组（3×3: 6″/9″ … 8×8: 95″/125″） | `data/levels.ts` | **每个尺寸都必须有阈值**，缺失会直接 throw；新增尺寸必须补一行 |
| `SIZE_TIME_LIMITS` | 3~8 每尺寸一组（3×3: 15″、4×4: 25″、5×5: 40″、6×6: 60″、7×7: 85″、8×8: 115″） | `data/levels.ts` | 每关限时；新增尺寸必须补一行，否则同样 throw |
| `TOTAL_ROUNDS`→`TIER_BLUEPRINTS` | 3 档（初级/高级/困难）× 12 关 = 36 关 | `data/levels.ts` | 加档位就往 `TIER_BLUEPRINTS` 加一项；`MAX_STARS = 108`、首页「/ 108」是算出来的 |
| `CYCLES_PER_TIER` | 2 | `data/levels.ts` | 每档把尺寸阶梯走两遍，第二遍时间标准更紧；改它同时改 `LEVELS_PER_TIER` |
| `cycleFactor` | 每循环收紧 3%，最低 0.7 | `data/levels.ts` | 同时作用于星级阈值与限时，是「不停关卡」的难度曲线 |
| 档位 → 卡片造型 | 初级=方形、高级=圆形、困难=生肖 | `data/levels.ts` `TIER_BLUEPRINTS` | 造型是档位皮肤，**不在 UI 上作为分类展示**；改这里会同时改三档的视觉 |
| `starGate` | 0 / 8 / 16 | `data/levels.ts` | 跨档门槛，关卡页与结算页的解锁提示文案会读它 |
| 生肖轮转 | 生肖档 12 关 = 12 生肖各一次 | `data/levels.ts` `zodiacIndex` | 改每档关数会影响生肖覆盖数量 |
| 关卡锁态 | 由 `utils/progress.ts` 的 `isLevelUnlocked` / `isChapterUnlocked` 统一判断 | **当前 `UNLOCK_ALL_LEVELS = true`（测试期临时开放全部关卡）**，改回 `false` 即恢复解锁规则 |
| `TONE_COUNT` | 6 | `components/GridCell/index.tsx` + `index.module.scss` 的 `$tone-count` | **三处必须一致**：JS `TONE_COUNT`、scss `$tone-count`、`theme.scss` 里 6 组 `$cell-tint-*` / `$cell-digit-*` |
| 卡片基准字号 | 方形卡 40rpx、圆形卡 30rpx | `components/GameGrid/index.module.scss` | 格内字号是相对它的 em 倍数；圆形卡另有 `circle3~circle8`（44→22rpx）按圈数收敛，因为扇环沿半径方向很薄 |
| 圆形卡分区 | 第 k 圈 2k-1 格 | `utils/circleLayout.ts` `buildCircleCells` | 靠 1+3+5+…=n² 正好容纳 size² 个数字；改分区方式要同时确认格子总数仍等于 size² |
| 生肖卡轮廓 | 12 个形状 = 椭圆并集 | `data/zodiacShapes.json` | 全部侧身朝右；作者只调椭圆，轮廓由算法生成。改完**必须**跑 `node scripts/preview-shapes.js` 确认「连通块=1」+ 各尺寸划分成功 |
| 生肖轮廓算法 | 追踪 56 格掩膜 → Chaikin×2 → DP 容差 0.012 | `utils/silhouette.ts` | **起点只能旋转不能排序**：排序会打乱边界顺序、平滑后轮廓就废了（这正是历史上「生肖形状一直不对」的根因） |
| 生肖分格算法 | 最远点采样 → Lloyd 松弛×3 → 多源 BFS 划分 | `utils/silhouette.ts` | 用 BFS 而不是「最近格心」，因为欧氏 Voronoi 在凹形处会把同一格拆成两块；分格分辨率 96，松弛 72 |
| 生肖墨线宽度 | 每格向形心收缩 `0.012 × size` | `utils/silhouette.ts` `CELL_INSET_FACTOR` | 卡片底色就是墨色，格子收缩后缝隙露出墨色 = 轮廓勾边 + 格线。改大线变粗 |
| 生肖卡字号 | `silhouette3~8` = 40/34/30/24/20/16rpx | `components/GameGrid/index.module.scss` | 比方形卡小，因为轮廓内格子比同尺寸规整网格小（8×8 最小格约 19rpx，是真机可读的下限） |
| 圆形卡内缩 | 5%（`.circleArea`） | `components/GameGrid/index.module.scss` | 让最外圈扇环不贴到圆边；调大等于整体缩小 |

**星级规则**（`utils/scoring.ts`）：用时 ≤ 3 星阈值 → 3 星；≤ 2 星阈值 → 2 星；否则 1 星；**0 失误额外 +1 星（上限 3 星）**。速度与精准是两条并行路线，改规则时不要破坏这一点。

**存档契约**（`shuerte_save`）：

```
stars{ levelId→最高星 } bestTimes{ levelId→最快ms } bestErrors{ levelId→最少失误 }
totalGames  streakDays  lastPlayedDate  recent[≤10]  settings{ sound, haptics }
```

**音效 key**：`tick`（倒计时/恢复）、`click`（点对）、`error`（点错）、`success`（结算页）。

---

## 5. 编码规范（本项目特有，必须遵守）

**布局与单位**
- 布局单位统一用 **rpx**（设计稿 750），间距只用 `$spacing-*`、圆角只用 `$radius-*`
- **禁止在 inline style 里写 rpx**：H5 端不转换 rpx，会错位。动态尺寸用**百分比**（如 `GameGrid` 的 `width/paddingBottom`）或 `Taro.pxTransform`
- 内容宽度上限 **686rpx**（750 − 32×2）；页面根容器必须有左右 `$page-padding`
- **方格宽度固定 686rpx**：依赖页面左右 padding 恰为 32rpx，改页面 padding 必须同步 `GameGrid` 的 `.grid` 宽度

**样式**
- 每个 `*.module.scss` 首行必须 `@use '@/styles/variables.scss' as *;`
- 类名 **camelCase**（禁用连字符 BEM，会触发 JSX 语法错误）
- 条件类名统一 `classnames(styles.a, cond && styles.b)`
- 只用 `theme.scss` / `variables.scss` 里已定义的变量，新增颜色先加到 `theme.scss`
- 修改 `theme.scss` / `variables.scss` 时必须**保留未改动的变量**

**组件与代码**
- 只用 `@tarojs/components`（`View`/`Text`/`Switch`…），禁止 `div/span/img/p`
- 页面组件必须 `export default`，名称以 `Page` 结尾（如 `GamePage`）
- 高频道组件（如格子）用 `React.memo`，**props 只传原始值**，回调必须 `useCallback` 稳定
- 状态更新必须产出**不可变快照**：`cells.slice()` 后替换变化的格子，禁止原地改
- 引用其他模块必须 import；类型引用必须存在（`noUnusedLocals: true`，别留未使用的 import）

**错误处理与日志**（与用户全局规则一致）
- 边界（路由参数、外部输入）**严格校验并显式失败**，不要用默认值兜底 —— 参考 `pages/game/index.tsx` 的关卡参数校验、`pages/result/index.tsx` 的结算参数校验
- 核心逻辑假设上游已校验，不要层层重复 `if (!x)`
- **禁止静默吞错**：`console.error('[模块名] 描述', error)` + 用户可感知的提示（如存档失败弹 toast）
- 增强能力（音效/震动）允许降级，但必须留错误日志
- 关键流程用 `console.info('[Game] 通关', {...})` 记录入参与结果

---

## 6. 常见改动指引（How-to）

| 我要做的事 | 改哪里 | 注意 |
| --- | --- | --- |
| 加关卡 / 加难度档 | `data/levels.ts` 的 `TIER_BLUEPRINTS`（关数 = `SIZE_STEPS.length × CYCLES_PER_TIER`） | 关卡由生成器产出，不要手写关卡对象 |
| 支持 9×9 等新尺寸 | ① `SIZE_THRESHOLDS` 加阈值 ② `SIZE_TIME_LIMITS` 加限时 ③ `SIZE_STEPS` 加尺寸 ④ `GameGrid` 的 module.scss 加一档 `.sizeN` 与 `.circleN` em 字号 | 四处都要改，缺 ①② 会直接 throw |
| 新增卡片造型 | `types/game.ts` 的 `CardStyle` → 在 `utils/` 加几何函数 → `GameGrid` 加一个分支 + module.scss 加 `.cardXxx`（记得给基准字号） | 几何是纯函数，放 utils；组件只负责摆放 |
| 调整圆形分区 | `utils/circleLayout.ts` 的 `buildCircleCells` | 改完必须确认格子总数仍 = size²（靠 1+3+5+… 奇数和） |
| 调整某个生肖的造型 | `data/zodiacShapes.json` 里增删/移动椭圆 → `node scripts/preview-shapes.js <key>` 验证 → `ASCII=1` 看轮廓、`DIVIDE=5` 看分格 | 必查「连通块=1」（有碎片说明某椭圆没和主体重叠）和 3×3~8×8 全部可划分；形状要单连通、面积别低于 ~22%，否则大尺寸会切出读不了的碎格 |
| 调整生肖卡墨线粗细 / 字号 | `utils/silhouette.ts` 的 `CELL_INSET_FACTOR`；`components/GameGrid/index.module.scss` 的 `silhouette3~8` | 两者要一起看：线变粗、格可视面积就变小，字号得跟着收 |
| 调整数字/底色配色 | `styles/theme.scss` 的 `$cell-tint-*` 与 `$cell-digit-*` | **成对增删**，并同步 `TONE_COUNT` 与 `$tone-count` |
| 新增玩法（倒序/双色/变位） | `types/game.ts` 加 `mode` → `data/levels.ts` 配置 → `utils/gameEngine.ts` 的 `target` 推进策略 | 引擎只有「当前目标」一个推进点，扩展成本低 |
| 换配色 / 加背景图案 | `styles/theme.scss` | 页面样式全部引用变量，改完即全局生效 |
| 调整音效 | `scripts/gen-sounds.js` 参数 → `node scripts/gen-sounds.js` | **不要手改 `data/sounds.ts`**（生成文件） |
| 加设置项 | `types/game.ts` 的 `GameSettings` → `store` 的 `initialData` → `pages/mine` UI → `app.tsx` 同步到服务 | 四处都要改，漏了会导致设置不生效 |
| 加页面 | 新建 `pages/<name>/{index.tsx,index.module.scss,index.config.ts}` + 注册进 `app.config.ts` | tabBar 页必须配 `iconPath`/`selectedIconPath` |
| 接云端排行榜 | 新建 `services/rank.ts`（`submitScore`/`fetchRank` 接口）→ `pages/rank` 换实现 | 上层无感知，是刻意的可替换设计 |

---

## 7. 每次改完的自查清单（质量门禁）

- [ ] `app.config.ts` 中每个页面都有 `index.tsx` + `index.module.scss` + `index.config.ts`
- [ ] 新增/删除的 import 与使用一致（无未使用、无缺失）
- [ ] 每个 `*.module.scss` 首行有 `@use '@/styles/variables.scss' as *;`
- [ ] 样式用到的变量都在 `theme.scss` / `variables.scss` 里有定义
- [ ] 无任何 inline style 里出现 rpx
- [ ] 新增的 tabBar 图标文件已生成到 `src/assets/tabbar/`
- [ ] 纯逻辑改动优先在 `utils/` 里做（可单测、不依赖 UI）
- [ ] 改动过的常量已在本文档 §4 同步
- [ ] 调用了 preview-server.js 并成功打开预览、功能实测通过
- [ ] 已更新 §3 台账与 §9 变更日志

---

## 8. 已知限制与决策记录

**已知限制**

| 限制 | 说明 | 处理 |
| --- | --- | --- |
| 小程序端音效需落地临时文件 | `InnerAudioContext` 不支持 data URI，`services/audio.ts` 会把 base64 写入 `USER_DATA_PATH` 再播放 | 已实现，勿改成直接塞 data URI |
| 排行榜为占位页 | M1 无后端，成绩仅存本机 | M3 实现 |
| 真机未验证 | 只做了浏览器端到端验证（自动化点击是通过派发 click 事件完成的） | 下次改动建议扫码真机复验手感/震动/音效 |
| 未接入版本控制 | 项目目录无 `.git` | 建议 `git init` 后再做大改动 |
| 模板遗留文件 | `services/cloud.ts` 为模板预置，M1 未使用（无后端） | 接云端时再启用 |
| 生肖卡 8×8 偏密 | 轮廓内分格，格子比同尺寸规整网格小：8×8 最小格约 19rpx（蛇/鸡/龙最紧），字号只能给到 16rpx | 已用 `preview-shapes.js` 逐形状卡过下限；要更宽松得先把偏瘦的形状（蛇）加粗 |
| 生肖「虎」偏猫科 | 剪影层面虎与猫无法区分（圆耳 + 四足 + 长尾），读图核验结论是「猫科动物」而非「虎」 | 生肖语境下成立；若要更明确需加条纹一类纹理信息，但小格上放图案会干扰扫数字 |
| `.env` 里有 API key | 项目根目录 `.env` 存了 `DASHSCOPE_API_KEY`（仅用于开发期用 qianwen-vision 读参考图/截图核验），当前项目未接入 git | `git init` 时**必须**先把 `.env` 加进 `.gitignore` |
| **⚠️ 关卡解锁被临时关闭（测试期）** | `utils/progress.ts` 的 `UNLOCK_ALL_LEVELS = true`，任意关卡可直接进入，UI 也不再显示锁态 | **用户测试完成后需改回 `false` 恢复解锁规则**（档内顺序解锁 + 跨档星星门槛） |

**关键决策（改代码前先理解为什么）**

| 决策 | 理由 |
| --- | --- |
| 点错罚时 1.5s，而不是只记次数 | 只记错误数会被「乱点流」绕过（手速够快蒙也能过）。加罚时后乱点成本高于收益，玩家自然转向「看准再点」，这才是舒尔特的训练价值 |
| 0 失误额外 +1 星（上限 3 星） | 让「手速」和「精准」成为两条并行追求路线，避免只有一种最优玩法 |
| 计时用 `Date.now()` 差值，不用定时器累加 | 小程序定时器会漂移、切后台会被节流；定时器只负责刷新显示 |
| 切后台自动暂停（`useDidHide`） | 否则「切出去等时间」的玩法会污染成绩 |
| 方格用 `padding-bottom` 百分比撑正方形 | 只依赖容器宽度，3×3~8×8 与所有卡片造型共用一套布局，不写死 px |
| 计时刷新隔离在 `TimerBar` 内部 | 避免 20fps 的刷新把 49 个格子的组件树一起重渲染 |
| 音效用 Node 合成后内联 base64 | 避免引入二进制资源、避免改动构建配置加静态资源目录，且随时可调参重生成 |
| 失败只由「超时」触发，不设错误次数上限 | 错误已经有罚时成本，再加次数上限会让同一次失误被罚两遍；限时是唯一的失败线，规则更好理解 |
| 尺寸逐关递增（3×3 → 8×8），而不是每档固定尺寸 | 每关都有看得见的难度变化，第一关 5 秒就能通关，新手不会在开局流失 |
| 分类只暴露「初级/高级/困难」，卡片造型作为档位皮肤不展示 | 玩家关心的是难度，不是造型名；把造型藏进档位，既满足难度递进又少一层认知负担 |
| 卡片造型按档位递进：初级方形 → 高级圆形 → 困难生肖 | 圆形卡格子沿圆周排布、无直角参照；生肖卡在轮廓内切不规则格，扫视难度依次抬高，与难度档一致 |
| 圆形卡整块圆盘分区（第 k 圈 2k-1 格），而不是内接正方形网格 | 内接网格会让圆盘四角空出一大块、格子仍是方形；按半径分圈 + 角度分格能把整块圆盘用满，格子自然沿圆边排一圈 |
| 圆形卡外圈先画、内圈后画 | 每格用「圆心 + 圆弧」的扇形多边形，内圈盖住外圈延伸到圆心的部分，就得到扇环，且点击命中的是最内层该圈 |
| 生肖卡整张卡裁成生肖轮廓，格子是轮廓内 Voronoi 划分 | 生肖是「卡片本体形状」的概念，铺满才读得出「整块是生肖」；用 Voronoi 分格而不是「格心 + 固定小方块」，是因为只有 Voronoi 能把轮廓完整铺满、格子紧贴拼合，观感才像「一整块被划分」而不是「贴了一堆方块」 |
| 生肖卡走墨色线稿风（卡片底色 = 墨色，格子收缩留缝） | 参考图的观感是「深色勾边 + 浅色格子」。只用一个墨色底 + 收缩的格子就能同时得到外轮廓勾边和格与格之间的分割线，不用为每格再叠一层黑边（DOM 少一半） |
| 生肖分格用「多源 BFS 生长」而不是「每像素找最近格心」 | 欧氏 Voronoi 在凹形轮廓里会把同一格心的区域拆成互不相连的两块，描出来的多边形会退化成面积 0；BFS 从格心向外生长，天然保证每格是连通的一整块 |
| 12 生肖统一侧身朝右 | 侧视轮廓的特征辨识度最高（角、耳、尾、腿都能露出来）；方向一致让 12 张卡扫视节奏统一 |
| 图案放在整张卡片上，小格只有数字 | 小格带图案会抢走数字的注意力（舒尔特的核心是扫数字）；卡片带造型则只影响整体氛围 |
| 每关限时按尺寸查表（约为 2 星阈值的 1.5 倍） | 参考舒尔特训练标准设定，限时只做「别卡死」的兜底，真正的时间压力来自星级阈值与罚时 |
| 限时失败不写存档、不解锁下一关 | 失败必须是「有代价的」才有张力，否则乱点凑数也能推进；同时不给失败记档，避免污染最佳成绩与成就统计 |
| 点对不改变格子底色，只播一次点击动效 | 点对后变色会把「已完成」变成视觉信息，玩家可以靠颜色扫格子，削弱「记忆并按顺序点击」的训练目标；进度改由顶部「已完成 x/N」承担 |
| 小格字号用 em 相对卡片基准字号 | 「尺寸 × 卡片造型」共 18 种组合，用 em 只需维护 6 档字号 + 每种造型一个基准字号，不用写组合矩阵 |

---

## 9. 变更日志

| 日期 | 变更 | 验证 |
| --- | --- | --- |
| 2026-09-21 | 产出游戏大纲与技术方案（`docs/`） | 文档评审 |
| 2026-09-21 | M1 完成：36 关对局引擎、计时判错、4 个音效、星级结算、本地存档、3 个 tabBar 页 + 2 个核心二级页、排行榜占位页、青绿主题与 6 个 tabBar 图标 | 浏览器端到端 8/8 通过 |
| 2026-09-21 | 关卡结构改为尺寸逐关递增：6 关（3×3 → 8×8），按图案分 3 章（方形 / 圆形 / 生肖）；星级阈值改为按尺寸查表；数字与底色 6 组成对配色；页面改柔光背景；关卡卡片加尺寸徽标并改两列布局；修复「卡在星星门槛时继续挑战会跳到未解锁关卡」 | 浏览器端到端 9/9 通过（含 3×3 / 5×5 圆形 / 7×7 生肖三种形态） |
| 2026-09-21 | 改为无限关卡：10 轮 × 6 关 = 60 关，尺寸阶梯 × 卡片造型（方形 / 圆形 / 12 生肖）自由组合，每轮难度系数收紧 3%；新增每关限时与超时失败（失败不记档、不能跳关）；图案从「小格」上移到「整张卡片」，小格只剩数字与浅色底；点对不再改变底色只播点击动效；关卡地图改为轮次横向滚动 | 浏览器端到端 9/9 通过（含 3×3 方形 / 圆形卡 / 生肖卡、超时失败全链路） |
| 2026-09-21 | 卡片轮廓按参考图精修：圆形卡改青灰绿系（底 `#eef4f1` / 边 `#80a0a0`），生肖卡改黑白剪影风格（白底 + 灰度生肖剪影 `grayscale` / `opacity .32`），方形卡保持彩色数字 | 浏览器端到端 5/5 通过（三种卡片计算值均符合参考图实测色值） |
| 2026-09-21 | 分类收敛为初级/高级/困难三档（卡片造型不再作为分类展示，改为档位皮肤）；圆形卡从内接正方形网格改为整块圆盘分区（半径分圈 2k-1 格 × 角度分格，格子是扇环，沿圆边排一圈）；生肖卡改为生肖轮廓铺满整张卡片、数字格切不规则四边形；新增纯几何模块 `utils/cardLayout.ts`；修复上一版 `cardLayout.ts` 遗留未定义导出导致对局页编译失败 | 浏览器端到端 7/7 通过（9/36 格圆形分区半径分组正确、生肖 9 格 clip-path 互不相同、点击命中正常、无编译错误） |
| 2026-09-21 | **临时**：按用户要求关闭关卡禁用（`utils/progress.ts` 的 `UNLOCK_ALL_LEVELS = true`），测试期任意关卡可直接进入 | 待用户测试完成后改回 `false` |
| 2026-09-21 | 生肖卡重构（按 `docs/refs/3.png` 参考图的线稿风）：① 修掉轮廓生成的真 bug —— 追踪出的边界点被**排序**后才做平滑，边界顺序被打乱，导致 clip-path 一直是乱的（这是历史上「生肖形状怎么改都不对」的根因）；② 12 生肖全部重画为「侧身朝右、突出角/耳/尾/腿」的椭圆并集，单连通、面积 22%~45%；③ 分格从「格心 + 固定小方块」改为**多源 BFS 生长的 Voronoi 划分**，格子紧贴拼合、铺满整条轮廓，每格是不规则多边形；④ 视觉改墨色线稿风：卡片底色 = 墨色，格子向形心收缩留缝，缝隙露出墨色即轮廓勾边 + 格线；⑤ 删掉 `utils/cardLayout.ts`（拆成 `circleLayout.ts` + `silhouette.ts`）；⑥ 重写 `scripts/preview-shapes.js`，新增连通性 / 面积 / 各尺寸分格可行性 / Voronoi ASCII 预览四项自检 | 自检脚本 12 形状 × 6 尺寸 72 组合全通过；浏览器实测 3×3=9 格、8×8=64 格、点击推进、圆形卡无回归；qianwen-vision 读 12 张截图核验，11 个「清晰可辨」，虎为「猫科动物」 |

---

## 10. 文档索引

| 文档 | 内容 |
| --- | --- |
| `README.md` | 面向「人」的项目说明：玩法、数值、快速开始 |
| `AGENTS.md`（本文） | 面向「续写者」的规范与进度台账 |
| `docs/game-design.md` | 游戏大纲：模块、关卡、通关规则、奖励、留存设计 |
| `docs/tech-plan.md` | 技术方案：选型、分层、核心模块设计、扩展性 |
