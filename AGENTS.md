# 舒尔特方格闯关小游戏 · AI 开发规范与进度台账

> **用途**：每次续写前先读这一份，30 秒掌握项目全貌、分层约束与当前进度。
> **最后更新**：2026-10-30 ｜ **当前阶段**：v2 视觉与结构改版（古风「乐谱纸 · 墨水与暖光」）已完成；圆形卡分格已重做，卷三的生肖卡已整体替换为「不规则图案卡」

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
| 启动 / 刷新预览 | `node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\preview-server.js" d:\working\play\yanlidazuozhan\shuerte` |
| 重新生成音效 | `node scripts/gen-sounds.js` |
| 重新生成曲库 | `node scripts/gen-songs.js`（改 `SPECS` / `HOOKS` 后必跑，会重写 `src/data/songs.ts`） |
| 和声体检 | `node scripts/analyze-songs.js` / `node scripts/analyze-songs.js classics`（强拍冲突必须为 0，退出码非 0 即不通过） |
| 旋律相似度自查 | `node scripts/audio-similarity.js`（音程串比对，连续 ≥8 音重合即报警；改旋律后必跑） |
| 获取技能资产目录 | `node "c:\Users\danna.zhang\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\get-skill-assets-dir.js"` |
| 重新生成图案轮廓 | `WRITE=1 node scripts/gen-pattern-shapes.js`（改的是 `scripts/gen-pattern-shapes.js` 里的 `parts`；`ASCII=1` 看轮廓） |
| 校验图案轮廓与分格 | `node scripts/preview-shapes.js [形状名]`（`ASCII=1` 看轮廓、`DIVIDE=5` 看分格；改了图案轮廓必跑） |
| 卡片造型肉眼验收 | `node scripts/preview-cards.js` → 用浏览器打开 `docs/card-preview.html`（直接调运行时几何函数画圆盘/图案卡/方形卡，不依赖 Taro 构建） |
| 真机视口截图 / 点击验证 | `node scripts/cdp-shot.js "<url>" "<out.png>" [--wait=1500] [--clicks=1,2,3] [--init=scripts/seed-save.js]`（先起静态服务，见下） |

约定：
- H5 自检：`npm run build:h5` → 在 `dist/h5` 起静态服务（`python -m http.server 8899`）→ 用 `scripts/cdp-shot.js` 截图。
  **Chrome 无头窗口最小 500px，直接 `--window-size=375` 会得到「500 布局裁到 375」的假图**，所以截图脚本用 CDP 覆盖成 375×812 真机视口
- **预置存档必须写成 `{"data": "<序列化后的存档>"}` 双层**：Taro H5 的 `setStorageSync` 会把值包一层 `{ data }` 再 `JSON.stringify`，`getStorageSync` 只认这层包装。裸写 `{"version":3,"state":{...}}` 会被判成「非本 API 写入」而丢弃，截图里就还是空进度（`scripts/seed-save.js` 已按双层写好，可直接复用）
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
| 卡片造型 | 方形（常规网格）/ 圆形（整块圆盘扇环分区）/ 图案（整张卡裁成 12 个不规则图案、格子是轮廓内 Voronoi 划分），作为难度档的皮肤 |
| 技术栈 | Taro 4.1.9 + React 18 + TypeScript 5 + Sass（CSS Modules）+ zustand + dayjs + classnames |
| 设计稿基准 | 750rpx（`config/index.ts` 的 `designWidth: 375`，**代码里统一写 rpx**） |
| 数据 | 纯本地，无后端、无登录、不涉及云开发 |
| 进度 | v2 完成：36 关（小令/中调/长调 三卷 × 12 关 = 前 6 关正序 + 后 6 关变体（小令/中调倒序、长调双色），尺寸 3×3→8×8，卡片造型 方形/圆形/图案，每关限时、计时、音效、存档、星级结算（满星 3/4/5））+ 第一关前的「引子」指引关 + 顺序解锁；音频系统完成（6 首算法原创 + 4 声部伴奏引擎 + 6 首公有领域名曲按战绩解锁）；M2/M3 见 §3 |

---

## 2. 目录与分层职责

| 层 | 路径 | 职责 | 禁止 |
| --- | --- | --- | --- |
| 页面 | `src/pages/<name>/` | 组装组件、页面级交互 | 写游戏规则、算星级 |
| 组件 | `src/components/<Name>/` | 纯展示，props 驱动 | 读写存档、直接调 Taro API |
| 逻辑 | `src/utils/` | 纯函数（引擎/计分/进度/格式化） | 碰 UI、碰平台 API，必须是可单测的纯函数 |
| 服务 | `src/services/` | 平台能力封装（音频/震动/存储） | 写业务规则 |
| 数据 | `src/data/` | 关卡配置、音效资源 | 写逻辑 |
| 状态 | `src/store/useSaveStore.ts` | 存档 + 设置（zustand persist） | 存派生值（星星总数由各页现算 `Object.values(stars).reduce(...)`，不进存档） |
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
| 首页 | `pages/home/index` | tabBar | ✅ 完整（v2 古风改版 + 谱纸动效） |
| 关卡 | `pages/levels/index` | tabBar | ✅ 完整（v2 卷册式改版） |
| 曲集 | `pages/collection/index` | tabBar | ✅ 完整（顺序解锁态） |
| 我的 | `pages/mine/index` | tabBar | ✅ 完整（精简：无成绩列表） |
| 对局 | `pages/game/index` | 二级（核心） | ✅ 完整 |
| 结算 | `pages/result/index` | 二级（核心） | ✅ 完整 |
| 排行榜 | `pages/rank/index` | 二级 | ⬜ 占位页（M3 实现） |

---

## 3. 模块进度台账（每次改动后更新此表）

### 3.1 已完成

| 模块 | 文件 | 状态 | 说明 |
| --- | --- | --- | --- |
| 对局引擎 | `utils/gameEngine.ts` | ✅ 完成 | 纯函数状态机：建局/倒计时/判错/限时失败/暂停/恢复/冻结用时；目标推进按玩法分流（正序/双色递增、倒序递减），`getDoneCount` / `getCurrentTarget` 是进度展示的唯一来源 |
| 计分规则 | `utils/scoring.ts` | ✅ 完成 | 星级 + 罚时换算；星级上限取该关满星（3/4/5），长调卷多一档极速阈值 |
| 关卡生成器 | `data/levels.ts` | ✅ 完成 | 3 卷 × 12 关 = 36 关，程序化生成；每卷前 6 关正序、后 6 关变体玩法（小令/中调倒序、长调双色），所以卷内尺寸不重复；满星 3/4/5；卷 = 分类，卡片造型是卷位皮肤（不在 UI 展示） |
| 玩法模式 | `types/game.ts` + `data/levels.ts` + `utils/gameEngine.ts` + `components/GridCell` | ✅ 完成 | `forward`（1→N²）/ `reverse`（N²→1）/ `alternate`（奇数格红、偶数格蓝，仍正序点）；倒序只改引擎推进方向，双色只改格子取色分支，互不影响 |
| 满星阶梯 | `data/levels.ts` + `utils/scoring.ts` + `components/StarRating` | ✅ 完成 | 小令 3 / 中调 4 / 长调 5；中调靠「达标 + 零失误」拿满，长调靠「极速（gold×0.85）+ 零失误」拿满 |
| 卡片分区几何 | `utils/circleLayout.ts` + `utils/silhouette.ts` | ✅ 完成 | 纯计算：圆形卡**带缝隙的圆角扇环**（半径分圈 × 角度分格，缝隙与圆角由半径/角度各收一点做出，弧线按「圆角段固定点数 + 中段按弧长」采样，8×8 单卡 clip-path 约 16KB）；图案卡轮廓追踪 + 距离场过滤 + Voronoi 分格 |
| 限时与失败 | `data/levels.ts` + `utils/gameEngine.ts` + `hooks/useGameEngine.ts` | ✅ 完成 | 每关按尺寸查限时表；倒计时归零即失败，不记成绩、不解锁下一关 |
| 配色系统 | `styles/theme.scss` + `components/GridCell` | ✅ 完成 | 6 组「浅色底 + 同色系数字」成对循环，取古风低饱和色（藕/杏/缃/黛/青/紫）；圆形卡盘面用凹槽色 `$paper-2`（缝隙才看得见）、图案卡线色 `$color-pattern-line = #cfbc9e`（与棋盘同族的纸褐，不用深墨，避免和前两章割裂）；页面柔光背景 |
| 图案主题 | `data/patternShapes.json` + `scripts/gen-pattern-shapes.js` + `utils/silhouette.ts` | ✅ 完成 | 12 个不规则图案（按出场顺序：水滴 / 心形 / 叶片 / 六角星 / 齿轮 / 五瓣花 / 四角星 / 葫芦 / 贝壳 / 八角花 / 十字花 / 云朵）由生成脚本用「圆 / 椭圆 / 胶囊 / 多边形」拼出来，烘成一条多边形写进 JSON；整张卡裁成图案形状，格子是轮廓内 Voronoi 划分出的不规则多边形，格心只落在「厚处」。**卷三不再有「生肖」这个概念**，只是「异形拼花」难度档。渲染上是「一整块图案面 + 一层 SVG 线条 + 直接落在格心的数字」，格子本身完全透明，没有纸片感 |
| 解锁逻辑 | `utils/progress.ts` | ✅ 完成 | 卷内顺序解锁 + 跨卷星星门槛 + 引子未通不开第一关；`UNLOCK_ALL_LEVELS` 已删除，不要再加临时开关 |
| 引子（指引关） | `data/levels.ts` `GUIDE_LEVEL` + `pages/game` + `store.tutorialDone` | ✅ 完成 | 第一关前的 3×3 教学局：无评星、不写档、不超时失败；按进度弹引导语，通关只记 `tutorialDone` 并解锁第一关 |
| 引擎 Hook | `hooks/useGameEngine.ts` | ✅ 完成 | 倒计时、点击副作用、切后台暂停 |
| 卡片与格子 | `components/GameGrid` + `GridCell` | ✅ 完成 | 三种布局分发（方形网格 / 圆形扇环 / 图案轮廓内 Voronoi 格）；格子用 clip-path 描述形状；字号 em 相对卡片基准字号自动适配；点对只播动效、**不改底色也不改数字色**（改了等于替玩家记位置）；**♪ 只在点过之后出现**——方形格落在右下角，异形格跟在数字后面，没点过的格子只有数字 |
| 黑胶唱片 | `components/Disc` | ✅ 完成 | 首页 / 曲集 / 对局页三处共用的黑胶盘：同心沟槽 + 两道对角反光 + 朱砂标签（含 ♪）。**沟槽是旋转对称的，光靠它转起来看不出来**，转动线索全靠反光带与标签音符；尺寸由父容器决定（100% 铺满），`spinning` / `speed` / `gold` / `label` 控制形态 |
| 计时显示 | `components/TimerRing` | ✅ 完成 | 50ms 刷新被隔离在组件内部；外圈是「朱砂进度环（8rpx）+ 黑胶唱片层 + 纸盘数字」三层，唱片复用 `Disc`（26s 一圈慢转） |
| 星级展示 | `components/StarRating` | ✅ 完成 | sm/md/lg + 结算页弹出动画 |
| 关卡卡片 | `components/LevelCard` | ✅ 完成 | 尺寸徽标 + 星级 + 最佳用时 + 锁态/当前高亮 |
| 音效 | `services/audio.ts` + `data/sounds.ts` | ✅ 完成 | 4 个音效（tick/click/error/success），base64 内联；演奏音与音效两条链路互不影响，可分别开关 |
| 曲库与和声 | `data/songs.ts` + `scripts/gen-songs.js` + `scripts/analyze-songs.js` | ✅ 完成 | 6 首算法原创（16 小节 × 4 拍 = 64 音）；**和弦轨与旋律共用同一份「分段进行」**（B 段 bar 8–11 反转），`removeFriction` 清掉 1/6/11 半音的三类和声冲突；低音轨是走动低音（根–五–根–三）不是踏板；体检脚本的验收线是「强拍冲突 = 0」 |
| 伴奏引擎 | `services/accompaniment.ts` + `services/audio.ts` | ✅ 完成 | 4 声部（低音/铺底/琶音/轻击）+ 分段动态（0–3 只低音铺底、4–7 加琶音、8–11 全开、末小节留白）；**单一 lookahead 调度**（25→30ms 醒一次、提前 0.25s 排程、全部用 `osc.start(when)` 绝对时间），旋律与伴奏同一时间轴；伴奏按 `barTimes[b] = noteTimes[b*4]` 跟随玩家击键，**不做量化**；旋律/伴奏声部分池（16/24），互不抢占 |
| 名曲拾遗 | `data/classics.ts` + `utils/classics.ts` | ✅ 完成 | 6 首公有领域名曲（欢乐颂/小步舞曲/致爱丽丝/卡农/绿袖子/茉莉花），自行记谱编配；解锁只认战绩（累计星星 24/48/72/96、1 张金唱片、8 关 S 评级），**全部由存档现算、不新增字段**；只进曲集、不进关卡 |
| 版权治理 | `docs/audio-license.md` + `scripts/audio-similarity.js` | ✅ 完成 | 资产清单 + 生成参数 + 判定依据 + 红线；音程串（移调不变量）最长公共子串比对，阈值 8 音 |
| 震动 | `services/haptics.ts` | ✅ 完成 | 仅失误与通关触发 |
| 存档 | `store/useSaveStore.ts` + `services/storage.ts` | ✅ 完成 | zustand persist，key = `shuerte_save` |
| 首页 | `pages/home/index` | ✅ 完成 | 谱纸首屏（五线谱 + 音符依次点亮）、宣传语、当前曲目（唱片常转，9s 一圈）、三卷进度、主按钮、拾星/收录/连续；无玩法长文案；导航栏标题置空，H5 端由 `useEffect` 兜底 `document.title` |
| 关卡地图 | `pages/levels/index` | ✅ 完成 | 卷首总星进度、三卷签条（小令/中调/长调）、卷首卡、引子入口、两列关卡卡、锁态与解锁提示 |
| 对局页 | `pages/game/index` | ✅ 完成 | 单行「曲名 · 卷名 关序」、环形计时（剩余 xx″ + ×失误徽章）、8 段谱线、引子引导语、倒计时/暂停/引子通关浮层、限时失败跳转、参数校验 |
| 结算页 | `pages/result/index` | ✅ 完成 | 通关：星级动画 + 破纪录 + 挑战下一关；失败：用时/失误/完成度，只能重打 |
| 曲集页 | `pages/collection/index` | ✅ 完成 | 6 张唱片按顺序开卷（未至 / 未收录 / 已收录 / 金唱片四态）、汉字序号朱印、**回放的是玩家最好那一次的击键节奏**（`utils/beats.ts` 取该曲记录最长的一关）、回放中该条唱片转 3.6s 一圈；标题行右侧有「伴奏 开/关」即时开关；下方「名曲拾遗」区块按战绩解锁；音色文案由 `song.style` 派生（不再写死在档位上） |
| 我的页 | `pages/mine/index` | ✅ 完成 | 演奏者统计卡（星/通关/场次/连续/金唱片）+ 声音（演奏音/伴奏/提示音/震动/音色）、画面两组设置 + 清空；「音符碎片」随安可曲占位一并移除 |
| 全局配置 | `app.config.ts` / `styles/theme.scss` / 6 个 tabBar 图标 | ✅ 完成 | 青绿主题 |

### 3.2 未开始 / 待办（按建议优先级）

| 待办 | 所属里程碑 | 落点 | 备注 |
| --- | --- | --- | --- |
| 每日挑战（日期哈希种子，全员同题） | M2 | `utils/shuffle.ts` 加 seed 参数、`utils/gameEngine.ts` 传入 | 回访率最高的一步 |
| 通关特效（格子依次消隐 + 粒子） | M2 | `pages/result` + 新组件 `ParticleLayer` | 能用 CSS 就不用 Canvas |
| 主题换肤 / 背景图案 | M2 | `styles/theme.scss` + `ThemeProvider` 组件 + 存档加 `settings.theme` | 变量已预留结构 |
| 成就系统（6 枚徽章） | M2 | 新建 `utils/achievements.ts` + `data/achievements.ts` | 存档需加 `achievements: string[]` |
| 新玩法：静默变位 | M2 | `types/game.ts` 加 mode，`data/levels.ts` 配置，引擎推进策略 | 倒序 / 双色交替已在档内后 6 关落地，只剩静默变位 |
| 双路线反馈（速度评级 / 精准评级） | M2 | `pages/result` | 给玩家第二个进步维度 |
| 排行榜（云端） | M3 | 新建 `services/rank.ts`（接口占位）+ `pages/rank` | 需服务端校验成绩时间戳防作弊 |
| 分享海报 | M3 | `pages/result` | |
| 第四卷「挑战」（混合玩法） | M3 | `data/levels.ts` 新增轮次 + `types/game.ts` 加 `mode` | 已在无限轮次里预留位置，依赖新模式先落地 |

### 3.3 验证状态

> 下表按时间累加，越靠下越新。**2026-10-30 之前的行里出现的「生肖卡」是当时卷三的造型名，现已整体替换为「图案卡」**，读旧行时按这个口径换算。

| 项 | 状态 |
| --- | --- |
| 浏览器端到端（首页→对局→倒计时→点对/点错→暂停→结算→存档回显） | ✅ 8/8 通过 |
| 关卡尺寸阶梯 / 彩色数字 / 浅色底 / 三种图案形态 | ✅ 9/9 通过（3×3 方形、5×5 圆形、7×7 生肖） |
| 无限关卡 / 限时倒计时 / 超时失败 / 卡片造型 × 尺寸组合 | ✅ 9/9 通过（60 关生成、剩余+用时双计时、点对不改底色、超时失败不记档且无「下一关」、圆形卡内接网格、生肖卡小格无图案） |
| 三卷分类 / 圆形卡圆盘分区 / 生肖卡轮廓内不规则格 | ✅ 7/7 通过（分类仅 小令/中调/长调、9 格呈 1+3+5 半径分组、36 格数字 1~36 无重复、生肖 9 格 clip-path 互不相同、方形卡无 clip-path、扇环点击命中、无编译错误） |
| 生肖卡重构（12 生肖轮廓 + 轮廓内 Voronoi 分格 + 墨色线稿） | ✅ 12/12 读图核验 + 交互核验（`node scripts/preview-shapes.js` 确认 12 形状全部单连通、面积 22%~45%、3×3~8×8 共 72 种组合全部划分成功且最小格 ≥19rpx；浏览器实测卡片底色 `rgb(47,47,51)`、3×3 有 9 格 / 8×8 有 64 格且 clip-path 互不相同、点击推进目标 1→2、圆形卡 9 格未受影响；用 qianwen-vision 读截图，12 生肖中 11 个「清晰可辨」、虎为「猫科动物」） |
| 玩法模式 / 满星阶梯 / 成绩展示 / 配色加深 | ✅ 13 项浏览器实测通过（三档星级总数 36/48/60；第 7~12 关徽标带「· 倒序 / · 双色」；正序 1→9 与倒序 9→1 的「当前目标 / 已完成」逐格联动正确；双色关 9 格实测 `toneOdd/toneEven` 且奇红偶蓝；圆形卡仍走 6 色循环无回归；结算页已无「三星目标」文案、困难档结算 5 星位；我的页成绩显示「初级 · 第 1 关 / 1.22″」且无「未知关卡 / NaN″」；格子描边 rgb(230,213,204)、6 色底色互异） |
| 圆形卡分格 / 生肖轮廓重做 | ✅ 几何自检 + 逐张读图核验（`preview-shapes.js` 12 形状 × 3~8 尺寸共 72 组合全部划分成功、连通块均为 1、最小格 20~32rpx；`buildSilhouetteCells` 72 组合最慢 90ms；`preview-cards.js` 渲染 3/5/8 圆盘 + 12 生肖 5×5 + 鼠/虎 8×8 逐张核对：圆盘每格之间缝隙清晰、格子有圆角，生肖中 鼠（双大耳 + 长尾）、牛（双角 + 口鼻）、虎（尖耳）、兔（长耳）、龙（蛇身带角）、蛇（盘绕）、羊（卷角）、鸡（冠 + 喙 + 尾羽）、狗（垂耳）一眼可辨，马/猴/猪 靠头身比例与尾巴区分；8×8 圆盘 clipPath 总字符 15.8KB） |
| 控制台报错 | ✅ 无阻断性报错（仅有 Taro 运行时未就绪时丢弃一条日志的 warn） |
| 真机（手指点击手感、震动、音效实际播放） | ⬜ **未验证**，下次改动建议扫码真机复验 |
| v2 古风改版（首页/关卡/曲集/我的/对局 + 引子） | ✅ 375×812 真机视口逐页截图核对：首页谱纸动效与三卷进度、关卡页三卷签条与锁态、引子入口、对局页单行标题 + 剩余 xx″ + ×失误徽章 + 8 段谱线、点过淡墨 + ♪ 落痕、引子引导语随进度切换、引子 9 连点后弹出「引子 · 已通」浮层、圆形卡/生肖卡无回归（生肖卡恢复墨色底 + 白色格子） |
| 带进度场景（`--init=scripts/seed-save.js`） | ✅ 修复预置存档双层包装后复验：关卡页 9/144 星、卷一 9/36、卷二开卷（0/48）、第 5 关朱砂「在此」、6~12 关虚线锁态；首页「继续演奏」+「小令 · 第 5 关 · 7×7」+ 曲目 5/6 段；我的页 9/144 与 4/12/4/3 四列统计、无今日/最近成绩；曲集 1/6 收录、第 2 首「未至」、第 3 首「未收录」（卷二已开卷） |
| 唱片转动 / 格子音符 / 数字墨色 / 首页标题 | ✅ CDP 读计算样式核验：首页唱片 `animationName=discSpin`、`9s`、两次采样 `transform` 不同（确实在转）；曲集点击第一条后唱片变 `3.6s` 且 transform 持续变化、条目显示「停止」+ 进度条；对局页 7×7 每格右下角有 ♪（淡朱，点过后加深）、数字为 `#2f2a24` 暖墨；引子页不限时环形满圈正常；首页 `document.title=眼力大作战` 且页面内无导航栏元素 |
| 预览服务掉线恢复 + 「我的」页列表 key 修复 | ✅ 浏览器实测通过（重启后首页→关卡→点第 1 关正常进入对局页，无「应用程序异常」/`ChunkLoadError`，可通关并写档；「我的」页今日/最近成绩列表正常渲染，控制台不再出现 `unique "key" prop` 警告，无新增报错） |
| 图案卡替换生肖 + ♪ 改按需 + 数字提浅 + 彩色配色 + 限时收紧 | ✅ `tsc --noEmit` 通过；`preview-shapes.js` 12 图案 × 3~8 尺寸 72 组合全部划分成功（连通块=1、最小格 17~36rpx、面积 18%~42%）；`preview-cards.js` 截图逐张核对：圆盘 3/5/8 缝隙清晰有圆角、12 图案 5×5 轮廓可辨（花瓣/星角/齿轮齿清楚）、六角星与五瓣花 8×8 分格铺满、五瓣花「已点示例」里 ♪ 只落在已点格且跟在数字后、方形卡「已点示例」♪ 只出现在 1~7 号格右下角；图案卡底色实测 `#e3d5bd` 与棋盘同族、数字 `#5b544b` 明显比原 `#2f2a24` 浅 |
| 音频系统（修音 + 伴奏 + 名曲） | ✅ `tsc --noEmit` + `build:h5` 通过；`analyze-songs.js` 原创 6 首「强拍冲突 0 / 弱拍经过 0 / 大跳 0」、名曲 6 首「强拍冲突 0」（6 处弱拍经过音是刻意保留的）；`audio-similarity.js` 12 首全部 PASS（无 ≥8 音程重合）；`buildBarPlan` 逐小节核对配器 —— 0–3 只有 bass+pad、4–7 加 arp、8–14 加 perc、15 只留 pad；CDP 实测曲集（30 星存档）：欢乐颂/卡农已解锁、小步舞曲 62.5%、致爱丽丝 41.6%、绿袖子 31.2%、茉莉花 37.5% 四条解锁进度条宽度与门槛一致，点击欢乐颂后 2.6s→4.6s 进度条 14px→25px（≈4.5→8 个音，与 100bpm 相符）、唱片转 3.6s、文案变「停止」；双色关 3-7 与我的页（30/144 星、金唱片 1、伴奏开关）无回归 |

---

## 4. 关键常量与数据契约

**改这些值前先看「联动影响」列。**

| 常量 | 值 | 位置 | 联动影响 |
| --- | --- | --- | --- |
| `COUNTDOWN_SECONDS` | 3 | `utils/gameEngine.ts` | 开局倒计时秒数，改完检查对局页遮罩文案 |
| `ERROR_PENALTY` | 150 ms | `utils/scoring.ts` | 罚时；对局页（引子引导语）、关卡页 footer、结算页都按 **2 位小数**读它（`formatSeconds(…, 2)` → `0.15″`），三处都已改成读常量，改数值即可 |
| `ERROR_FLASH_MS` | 420 ms | `utils/gameEngine.ts` | 错误格子红闪时长；与 `GridCell` 的 `cellShake` 动画时长（0.3s）相关联 |
| `RECENT_LIMIT` | 10 | `store/useSaveStore.ts` | 存档保留最近成绩条数；首页只展示 5 条 |
| `TICK_INTERVAL` | 50 ms | `components/TimerBar/index.tsx` | 计时刷新频率 |
| `SAVE_STORAGE_KEY` | `'shuerte_save'` | `services/storage.ts` | **改名字 = 老用户存档全部丢失**；加字段请走 persist `version` + migrate |
| `SIZE_THRESHOLDS` | 3~8 每尺寸一组 gold/silver（3×3: 5″/8″、4×4: 10″/15″、5×5: 22″/32″、6×6: 38″/55″、7×7: 58″/82″、8×8: 82″/115″） | `data/levels.ts` | **每个尺寸都必须有阈值**，缺失会直接 throw；新增尺寸必须补一行。这组数字同时决定 `SIZE_TIME_LIMITS`（= silver × 1.15），调阈值会连带改限时 |
| `SIZE_TIME_LIMITS` | 3~8 每尺寸一组（3×3: 12″、4×4: 17″、5×5: 37″、6×6: 63″、7×7: 94″、8×8: 132″） | `data/levels.ts` | 每关限时，口径是 **`silver` 阈值 × 1.15**（3×3 例外 ×1.5，因为新手要认格子）。**这个系数是「通关率旋钮」**：调大到 1.4 以上就人人能过，调小到 1.05 以下会让 7×7/8×8 变成硬门槛。新增尺寸必须补一行，否则 throw |
| `TIER_BLUEPRINTS` | 3 卷（小令/中调/长调）× 12 关 = 36 关；每卷 `maxStars` = 3/4/5、`variant` = 倒序/倒序/双色、`pace` = 纸面方寸/圆盘流转/异形拼花 | `data/levels.ts` | 加卷就往 `TIER_BLUEPRINTS` 加一项（`maxStars` / `variant` / `pace` 都在里面配）；`MAX_STARS = 144`（12×3 + 12×4 + 12×5）是算出来的，别写死；**卷名只在这里改，页面读 `chapterTitle`** |
| `PLATINUM_RATIO` | 0.85 | `data/levels.ts` | 长调卷的「极速」阈值 = gold × 0.85；只有 `maxStars >= 5` 的卷会生成它，其余卷 `platinum = null`（星级判定直接跳过） |
| `CYCLES_PER_TIER` | 2 | `data/levels.ts` | 每档两轮：第一轮正序走完尺寸阶梯，第二轮**换变体玩法**（不再重复正序关）；改它同时改 `LEVELS_PER_TIER` |
| `cycleFactor` | 每循环收紧 3%，最低 0.7 | `data/levels.ts` | 同时作用于星级阈值与限时，是「不停关卡」的难度曲线 |
| 卷 → 卡片造型 / 满星 / 变体玩法 | 小令=方形·3 星·倒序、中调=圆形·4 星·倒序、长调=图案·5 星·双色 | `data/levels.ts` `TIER_BLUEPRINTS` | 造型是卷的皮肤，**不在 UI 上作为分类展示**；改这里会同时改三卷的视觉、满星上限与后半段玩法 |
| `starGate` | 0 / 8 / 16 | `data/levels.ts` | 跨档门槛，关卡页与结算页的解锁提示文案会读它 |
| 图案轮转 | 图案档 12 关 = 12 个图案各一次 | `data/levels.ts` `patternIndex` | `patternIndex = (index - 1) % PATTERN_SHAPES.length`，改每档关数会影响图案覆盖数量（12 关正好一轮） |
| 关卡锁态 | 由 `utils/progress.ts` 的 `isLevelUnlocked` / `isChapterUnlocked` / `findCurrentLevel` 统一判断 | 正式规则：卷内顺序解锁 + 跨卷 `starGate` + **引子未通不开第一关**。`UNLOCK_ALL_LEVELS` 已删除，别再加临时开关 |
| `GUIDE_LEVEL` | `id = 'guide'`、3×3、`tutorial: true`、`maxStars = 0`、`timeLimit = 60s` | `data/levels.ts` | 不进 `LEVELS`，所以不占星、不进曲集、不影响 `MAX_STARS`；`getLevelById` 特判返回它 |
| `tutorialDone` | `false`（老存档迁移时：已玩过视为 `true`） | `store/useSaveStore.ts`（v3） | `findCurrentLevel` 的第三个入参；为 `false` 时首页/关卡页都会把玩家送去引子 |
| `TONE_COUNT` | 6 | `components/GridCell/index.tsx` + `index.module.scss` 的 `$tone-count` | **三处必须一致**：JS `TONE_COUNT`、scss `$tone-count`、`theme.scss` 里 6 组 `$cell-tint-*` / `$cell-digit-*` |
| 卡片基准字号 | 方形卡 40rpx、圆形卡 30rpx | `components/GameGrid/index.module.scss` | 格内字号是相对它的 em 倍数；圆形卡另有 `circle3~circle8`（44→22rpx）按圈数收敛，因为扇环沿半径方向很薄 |
| 圆形卡分区 | 第 k 圈 2k-1 格，每格是**带缝隙的圆角扇环** | `utils/circleLayout.ts` `buildCircleCells` | 靠 1+3+5+…=n² 正好容纳 size² 个数字；改分区方式要同时确认格子总数仍等于 size²。缝隙宽度见 `gapOf`（随圈厚自适应 0.7~1.5%），圆角用「半径在弧线两端回落」逼近 |
| 图案卡轮廓 | 12 个形状 = **一条归一化多边形** | `data/patternShapes.json`（由 `scripts/gen-pattern-shapes.js` 生成） | 手写坐标画不出花瓣/齿轮齿/贝壳纹，所以用「圆 / 椭圆 / 胶囊 / 多边形」在生成脚本里拼，烘成轮廓写回 JSON。**改形状只改生成脚本再 `WRITE=1` 重跑，不要手改 JSON**；改完**必须**跑 `node scripts/preview-shapes.js` 确认「连通块=1」+ 各尺寸划分成功 |
| 图案出场顺序 | `ORDER` 数组决定 12 个图案在卷三 12 关里的先后，与 `DESIGNS` 的定义顺序解耦 | `scripts/gen-pattern-shapes.js` 顶部 | 顺序必须与尺寸阶梯配对：下标 0/6 落 3×3、1/7 落 4×4……5/11 落 8×8。**小尺寸配整体性强的简单轮廓**（水滴 / 四角星），大尺寸才配细碎造型（齿轮 / 八角花）——3×3 只有 9 个大格子，配齿轮会把齿全吃掉。`ORDER` 与 `DESIGNS` 长度不等时脚本直接报错，改完必须 `WRITE=1` 重新生成 json |
| 音频：声部上限 | 旋律 16 / 伴奏 24 | `services/audio.ts` | 两个池**分开淘汰**。合成一个池（旧版 10 声部）时伴奏和弦会把旋律音挤掉，表现是「和弦响了、旋律断了」 |
| 音频：调度参数 | tick 30ms / lookahead 0.25s / 起播留白 0.15s | `services/audio.ts` | **墙钟决定「排哪些事件」，音频时钟决定「何时响」**。反过来用 `ctx.currentTime` 算 horizon，上下文被挂起时会死锁（currentTime 冻结 → 整首卡在第一个音）。lookahead 调小会让低端机漏拍 |
| 音频：和声验收 | 强拍冲突 = 0（1/6/11 半音） | `scripts/analyze-songs.js` | 改口径等于改验收线。九度/十一度/十三度算色彩音、不报；弱拍上的冲突算经过音、只记不判 |
| 音频：相似度阈值 | 连续 8 个音程 | `scripts/audio-similarity.js` | 8 音大约是一句能被认出来的长度；调到 6 会天天报警，调到 10 以上会漏掉真正的撞句 |
| 名曲解锁门槛 | 24 / 48 / 72 / 96 星、1 张金唱片、8 关 S | `data/classics.ts` 各曲 `unlock` | 全部由存档现算（`utils/classics.ts`），**不新增存档字段**；上限是 `MAX_STARS = 144`，门槛别写超过它 |
| 图案轮廓算法 | 追踪 72 格掩膜 → Chaikin×2 → DP 容差 0.012 | `utils/silhouette.ts` | **起点只能旋转不能排序**：排序会打乱边界顺序、平滑后轮廓就废了（这正是历史上「形状一直不对」的根因） |
| 图案分格算法 | 距离场过滤「厚处」→ 最远点采样 → Lloyd 松弛×3 → 多源 BFS 划分 | `utils/silhouette.ts` | 用 BFS 而不是「最近格心」，因为欧氏 Voronoi 在凹形处会把同一格拆成两块；分格分辨率 96，松弛 72。`SEED_CLEARANCE` 保证花瓣尖/齿轮齿这类细长处不落格心（否则会切出放不下数字的碎片格），细长形状不够就逐级放宽 |
| 图案线条层 | 一张 SVG data URI：图案面 + 外轮廓（`PATTERN_OUTLINE_WIDTH = 0.85`）+ 唯一分割线（`PATTERN_LINE_WIDTH = 0.36`），单位是 viewBox 的 100 | `utils/silhouette.ts` 的 `buildPatternInk` + `GameGrid` 的 `.patternInk` | 线**不再由格子内缩露底色产生**，而是独立画一遍：`stroke-width` 统一 → 线宽绝对均匀。分割线来自 `buildSeamPolylines`（直接读像素归属，每条内部边只出现一次）。**千万不要改回「每格各画一遍多边形」**：相邻两格各自简化过，同一条边会描成两条错开的线，立刻退回「一堆小卡片」 |
| 图案格子（热区） | `SilhouetteCell.clipPath` + `GridCell` 的 `ghost` 态：**完全透明**，只有数字和点击命中 | `components/GridCell/index.module.scss` 的 `.cell.ghost` | 透明格子上不能有任何底色/描边/圆角/阴影，否则图案卡又变回「一堆卡片」。`.cell.ghost` 的优先级要压过 `.tone1~6` 与 `.toneOdd/.toneEven` 的底色（彩色/双色关在图案卡上只改数字颜色） |
| 图案卡配色 | 图案面 `#fffdf8`、线 `#cfbc9e`，写在 `silhouette.ts` 的 `PATTERN_FACE_COLOR` / `PATTERN_LINE_COLOR` | `utils/silhouette.ts`（SVG 拿不到 SCSS 变量） | `theme.scss` 里同名变量只是文档镜像，**改色必须两处一起改**，否则只有图案卡不跟着变 |
| 图案卡字号 | `pattern3~8` = 44/38/34/28/24/20rpx | `components/GameGrid/index.module.scss` | 比方形卡小，因为轮廓内格子比同尺寸规整网格小（8×8 最小格约 20~32rpx） |
| 圆形卡内缩 | 5%（`.circleArea`） | `components/GameGrid/index.module.scss` | 让最外圈扇环不贴到圆边；调大等于整体缩小 |
| 格子数字色 | `#5b544b`（暖褐灰） | `styles/theme.scss` 的 `$color-cell-text` | **不要写回 `$ink-900` / `#2f2a24`**：不显式给色时格子会继承页面默认纯黑，近白格面上又黑又硬；但也不要浅过 `#6b6459`，8×8 小格会糊。改色只动这一个变量 |
| 格子音符标记 | **只在点过之后出现**：方形格右下角 `♪`（`0.42em` / `rgba(216,78,30,0.72)`），异形格跟在数字后（`.value::after`，`0.62em`） | `components/GridCell/index.module.scss` 的 `.cell.done:not(.clipped)::after` 与 `.cell.done.clipped .value::after` | 两条规则缺一不可：方形格用伪元素角标，异形格（圆盘扇环 / 图案多边形）右下角在卡片外、只能跟在数字后面。**未点过的格子绝对不能有 ♪**，否则等于把「还没点」标出来了。点过后也**不改底色、不改数字色**，♪ 是唯一反馈 |
| 唱片转速 | 首页 9s / 曲集回放 3.6s / 对局页 26s（一圈秒数） | `Disc` 的 `speed` prop | 同心沟槽旋转对称，看不出转；转动线索只有两道反光带与标签上的 ♪，调慢到 20s 以上基本就「像没转」 |
| 唱片标签占比 | 42%（`Disc` 的 `.label`） | `components/Disc/index.module.scss` | 同时决定 ♪ 的可读性：标签小于 36% 时 22rpx 的音符会顶到边缘 |
| 击键记录（beats） | 每关最多 64 个毫秒数 | `hooks/useGameEngine` 的 `beatsRef` → `submitResult(result, grade, beats)` | 只记**点对**的时刻，含罚时；失败局与引子关不写。36 关全满约 14KB，别往 `recent` 里塞（会翻 10 倍） |
| 记录覆盖规则 | 星级 → 用时 → 失误 | `store/useSaveStore` 的 `isBetterRun` | **不满足就不覆盖**：这是「敢反复重玩」的前提，改成「最近一次为准」会让玩家刷新后不敢再玩 |

**星级规则**（`utils/scoring.ts`）：用时 ≤ gold 阈值 → 3 星；≤ silver → 2 星；否则 1 星；长调卷 ≤ platinum（= gold × 0.85）→ 4 星；**0 失误额外 +1 星，上限是该关满星（小令 3 / 中调 4 / 长调 5）**。满星只在零失误时拿得到，速度与精准是两条并行路线，改规则时不要破坏这一点。

**存档契约**（`shuerte_save`，`SAVE_VERSION = 4`）：

```
stars{ levelId→最高星 } bestTimes{ levelId→最快ms } bestErrors{ levelId→最少失误 }
bestRuns{ levelId→{ stars, elapsed, errors, beats[] } }   ← 「最好那一次」的完整记录
totalGames  streakDays  lastPlayedDate  recent[≤10]  tutorialDone
settings{ sound, music, haptics, colorful, timbre }
```

**回放契约**（曲集「我的演奏」）：
- `beats` = 那一次通关时**每次点对的 `getElapsed`**（ms，含罚时，所以点错后的停顿也被还原），长度 = 该关数字个数
- 覆盖规则 `isBetterRun`：**星级高者胜 → 同星级比用时短 → 再比失误少**；不满足就**不覆盖**，打崩了不会冲掉最好记录
- 曲集整曲回放取「该曲 6 关里记录最长的那一条」（8×8 通了正好 64 音），不足 64 音的部分按曲目 BPM 续播；回放时整体减去 `beats[0]`，开局发呆的几秒不算演奏
- 失败局、引子关不写档，因此不产生 beats

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

**古风语汇**
- 档位文案只用「小令 / 中调 / 长调」，不要写回「初级/高级/困难」（卷名以 `TIER_BLUEPRINTS` 为准）
- 新增颜色只用 `theme.scss` 的纸/墨/朱砂体系：`$paper-*` / `$ink-*` / `$sunset*` / `$seal*` / `$ring-track`；朱砂只用于印章与「当前」标记
- 纸纹、卷面框、印章统一用 `variables.scss` 的 `paper-grain` / `scroll-frame` / `seal-chip`，别在页面里重复写渐变
- 页面根容器加 `@include paper-grain`，四页纸感要一致；格子内部禁止加纹理
- **唱片一律用 `components/Disc`**：首页、曲集、对局页三处的黑胶盘面是同一份实现（同心沟槽 + 两道反光 + 朱砂标签），不要在任何页面里再手写一遍 `repeating-radial-gradient` 纹路，否则三处转速、反光角度会各走各的

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
| 调整圆形分区 / 缝隙 | `utils/circleLayout.ts` 的 `buildCircleCells`（缝隙看 `gapOf`，圆角看 `corner`） | 改完必须确认格子总数仍 = size²（靠 1+3+5+… 奇数和）。缝隙太大会吃掉格厚（8×8 圈厚只有 6.25%），太小又糊成一片；盘面底色要深于格子，否则缝隙看不见 |
| 调整某个图案的造型 | **改生成脚本** `scripts/gen-pattern-shapes.js` 里对应 key 的 `parts`（`C` 圆 / `E` 椭圆 / `K` 胶囊 / `P` 多边形 / `M` 镜像，配 `ring()` / `spikes()` 批量摆放）→ `ASCII=1 node scripts/gen-pattern-shapes.js <key>` 看轮廓 → `WRITE=1 node scripts/gen-pattern-shapes.js` 落盘 → `node scripts/preview-shapes.js <key>` 验证分格 | **不要手改 `patternShapes.json`（生成文件）**。必查「连通块=1」（有碎片说明某个零件没和主体重叠）和 3×3~8×8 全部可划分；零件要粗（宽度 ≥ 0.1），否则大尺寸会切出放不下数字的碎格。图案是「好认但不许带语义」的不规则形，别往里塞具体物象 |
| 调整图案线宽 / 字号 | `utils/silhouette.ts` 的 `PATTERN_LINE_WIDTH`（格线）与 `PATTERN_OUTLINE_WIDTH`（外轮廓），单位是 viewBox 的 100（1 单位 ≈ 6.9rpx）；`components/GameGrid/index.module.scss` 的 `pattern3~8` | 外轮廓必须 ≥ 格线，否则图案边界被内部网格盖过。格线 0.36 ≈ 2.5rpx ≈ 1.2px，外轮廓 0.85 ≈ 5.8rpx（**真机上试过 0.55，外轮廓和内部网格几乎同粗，图案边界读不出来**）；格线再细到 0.2 以下真机低分屏会发虚 |
| 调整限时松紧 | `data/levels.ts` 的 `SIZE_TIME_LIMITS`（口径 = `SIZE_THRESHOLDS.silver × 1.15`） | 想整体放宽就改那个 1.15 系数并重算全表，**别只改一两个尺寸**——限时是逐尺寸查表的，单改一格会让难度曲线出现断层 |
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
| 图案卡 8×8 偏密 | 轮廓内分格，格子比同尺寸规整网格小：8×8 最小格等效直径约 17~32rpx（叶片/六角星的尖角最紧），字号只能给到 20rpx | 已用 `preview-shapes.js` 逐形状卡过下限；要更宽松得先把偏细的图案（叶片尖端、六角星/四角星的尖角）改钝 |
| 图案线条在交汇处有 1~2px 缺口 | `buildSeamPolylines` 在「度数 ≠ 2」的顶点把线断成多段，每段独立做 DP 简化 + Chaikin；端点不动，但极短的段平滑后可能缩到几乎看不见 | 真机尺寸（375px）下不可见，放大 2 倍才看得出。要彻底消除得把分叉点也纳入平滑（会牺牲交汇处的锐度），不值得 |
| 图案线条偶有短毛刺 | 两个标签交界处存在只有 2 个像素点的极短边，简化后保留下来画成小短线 | 真机不可见；若在意可在 `buildSeamPolylines` 末尾按「归一化长度 < 0.4」过滤，代价是真实的短边也会被吞掉 |
| `.env` 里有 API key | 项目根目录 `.env` 存了 `DASHSCOPE_API_KEY`（仅用于开发期用 qianwen-vision 读参考图/截图核验），当前项目未接入 git | `git init` 时**必须**先把 `.env` 加进 `.gitignore` |
| H5 预览的视口 | `src/index.html` 把 `html { font-size: 18px }` 写死，rpx 换算固定；Chrome 无头窗口最小 500px，直接 `--window-size=375` 会得到「500 布局裁到 375」的错位截图 | 用 `scripts/cdp-shot.js`（CDP `setDeviceMetricsOverride` 覆盖成 375×812）核对 |
| **⚠️ H5 预览服务会掉线（报「应用程序异常」）** | 预览壳的云沙箱会话会失效（`.pai/pai.log` 里表现为每 10s `WebSocket ... Unexpected server response: 404`），随后 `preview-server.js` 在 `updateCloudDev` 时抛 `WebSocket is not open: readyState 0 (CONNECTING)` 直接崩溃。此时首页/关卡页等**已加载并缓存**的 chunk 仍能显示，只有需要新拉路由 chunk 的页面（如对局页）会弹「应用程序异常」——错误信息是 `Loading chunk src_pages_game_index_tsx failed.`，堆栈是 `ChunkLoadError` | **这不是业务代码 Bug**。恢复办法：重跑 §0 的 preview-server 命令（端口复用 57544，URL 不变），**然后必须重新打开/硬刷新预览页**（重建后 chunk hash 变了，旧标签页持的是失效构建）。**切勿删 `.pai/pai-preview-server.lock`** |

**关键决策（改代码前先理解为什么）**

| 决策 | 理由 |
| --- | --- |
| 点错要罚时（`ERROR_PENALTY`，当前 150 ms），而不是只记次数 | 只记错误数会被「乱点流」绕过（手速够快蒙也能过）。加罚时后乱点成本高于收益，玩家自然转向「看准再点」，这才是舒尔特的训练价值。**注意：罚时数值当前是 150 ms，而最初的设计口径是 1500 ms**，改回时需同步 README 与关卡页 footer 文案 |
| 0 失误额外 +1 星（上限为该关满星 3/4/5） | 让「手速」和「精准」成为两条并行追求路线，避免只有一种最优玩法；满星只在零失误时拿得到，高难档有 4~5 颗星的进步空间 |
| 计时用 `Date.now()` 差值，不用定时器累加 | 小程序定时器会漂移、切后台会被节流；定时器只负责刷新显示 |
| 切后台自动暂停（`useDidHide`） | 否则「切出去等时间」的玩法会污染成绩 |
| 方格用 `padding-bottom` 百分比撑正方形 | 只依赖容器宽度，3×3~8×8 与所有卡片造型共用一套布局，不写死 px |
| 计时刷新隔离在 `TimerBar` 内部 | 避免 20fps 的刷新把 49 个格子的组件树一起重渲染 |
| 音效用 Node 合成后内联 base64 | 避免引入二进制资源、避免改动构建配置加静态资源目录，且随时可调参重生成 |
| 失败只由「超时」触发，不设错误次数上限 | 错误已经有罚时成本，再加次数上限会让同一次失误被罚两遍；限时是唯一的失败线，规则更好理解 |
| 尺寸逐关递增（3×3 → 8×8），而不是每档固定尺寸 | 每关都有看得见的难度变化，第一关 5 秒就能通关，新手不会在开局流失 |
| 分类只暴露「初级/高级/困难」，卡片造型作为档位皮肤不展示 | 玩家关心的是难度，不是造型名；把造型藏进档位，既满足难度递进又少一层认知负担 |
| 卡片造型按档位递进：初级方形 → 高级圆形 → 困难图案 | 圆形卡格子沿圆周排布、无直角参照；图案卡在轮廓内切不规则格，扫视难度依次抬高，与难度档一致 |
| 圆形卡整块圆盘分区（第 k 圈 2k-1 格），而不是内接正方形网格 | 内接网格会让圆盘四角空出一大块、格子仍是方形；按半径分圈 + 角度分格能把整块圆盘用满，格子自然沿圆边排一圈 |
| 圆形卡外圈先画、内圈后画 | 每格用「圆心 + 圆弧」的扇形多边形，内圈盖住外圈延伸到圆心的部分，就得到扇环，且点击命中的是最内层该圈 |
| 图案卡整张卡裁成图案轮廓，格子是轮廓内 Voronoi 划分 | 图案是「卡片本体形状」的概念，铺满才读得出「整块是个形状」；用 Voronoi 分格而不是「格心 + 固定小方块」，是因为只有 Voronoi 能把轮廓完整铺满、格子紧贴拼合，观感才像「一整块被划分」而不是「贴了一堆方块」 |
| 卷三从「12 生肖」换成「12 不规则图案」 | 生肖是「要认出来是什么动物」的承诺：画不像就是 bug（读图核验里虎被判成「猫科动物」就是活例子），而画得像又需要毛发/条纹级别的细节，在小格上会干扰扫数字。改成五瓣花/云朵/水滴/齿轮这类**抽象图案**后，判据从「像不像」变成「好不好看」，且图案不带语义、不抢注意力 |
| 图案卡走纸褐细线（线色 `#cfbc9e`），不再用墨色 | 卷三原先是「墨底白格」的黑白剪影风，与卷一/卷二的纸褐体系割裂；改成与棋盘同族的纸褐后，三卷在同一张乐谱纸上，只有分格难度在递进。**线必须细**：粗线会把整块图案切成马赛克，「这是一个完整图案」的观感就没了 |
| 图案卡的分割线由**独立 SVG 线条层**画，而不是「格子内缩露底色」 | 后者的每条线都是「某一格的边框」：两格各让一半，缝宽受格子形状影响（瘦长格细、矮胖格粗），而且格子本身是一块有底色的小多边形 —— 无论缝多细，看起来都是「一堆小卡片」。独立线条层让线只被描一次、宽度由 `stroke-width` 统一控制，格子退化成完全透明的点击热区，图案才真正成为「一整块面 + 一组线 + 数字」 |
| 分割线从**像素归属**提取（每条内部边只出现一次），而不是「每格多边形各画一遍」 | 相邻两格共享同一条 Voronoi 边，但两格各自独立做过 Douglas-Peucker 简化，同一条边会变成两条错开的折线，各画一遍就是**双线**（实测非常明显）。按像素标签提边天然去重，且能顺带拿到三格交汇的分叉点 |
| 图案分格用「多源 BFS 生长」而不是「每像素找最近格心」 | 欧氏 Voronoi 在凹形轮廓里会把同一格心的区域拆成互不相连的两块，描出来的多边形会退化成面积 0；BFS 从格心向外生长，天然保证每格是连通的一整块 |
| 12 个图案统一「中心对称 + 单个主体」 | 花瓣/尖角沿圆周均布、不做偏心构图：卡片旋转后仍像「一整块」，且每个图案的扫视节奏一致，玩家不用为不同图案重新适应 |
| 图案放在整张卡片上，小格只有数字 | 小格带图案会抢走数字的注意力（舒尔特的核心是扫数字）；卡片带造型则只影响整体氛围 |
| 每关限时按尺寸查表（= 2 星阈值 × 1.15） | 限时只做「别卡死」的兜底，真正的时间压力来自星级阈值与罚时。**系数原本是 1.5，实际手感是「怎么点都能过」**（8×8 给到 132″，而 2 星线才 115″），收紧到 1.15 后才有「差一点就超时」的紧张感 |
| 限时失败不写存档、不解锁下一关 | 失败必须是「有代价的」才有张力，否则乱点凑数也能推进；同时不给失败记档，避免污染最佳成绩与成就统计 |
| 点对不改变格子底色与数字色，只播一次点击动效 + 落一枚 ♪ | 点对后变色会把「已完成」变成视觉信息，玩家可以靠颜色扫格子，削弱「记忆并按顺序点击」的训练目标；♪ 只在点过之后出现，既给了反馈又不提前泄露「哪些还没点」 |
| 小格字号用 em 相对卡片基准字号 | 「尺寸 × 卡片造型」共 18 种组合，用 em 只需维护 6 档字号 + 每种造型一个基准字号，不用写组合矩阵 |
| 档内第二轮的重复关卡改成变体玩法（倒序 / 双色） | 原来每档把 3×3→8×8 走两遍，第 7~12 关和第 1~6 关完全一样，玩家看到的是「重复关卡」。加一层 `mode` 后尺寸阶梯仍走一遍，但第二轮换了规则，档内 12 关没有一关重复——比单纯砍掉 6 关（会丢掉 12 图案覆盖）保留了更多内容 |
| 倒序只改引擎的目标推进方向，正序/双色仍递增 | 三种玩法只在「下一个目标是什么」这一点分叉，`createGame` 定初值、`tapCell` 定推进与结束判据，其余（判错、罚时、限时、结算）完全共用，扩展成本最低 |
| 双色交替只配在困难档（图案卡） | 双色把注意力从「形状」转到「奇偶」，正好叠在扫视最难的图案卡上；初级/高级保持 6 色循环，避免一上手就要同时记「顺序 + 奇偶」两套规则 |
| 满星改为初级 3 / 高级 4 / 困难 5（困难多一档极速阈值） | 高难档需要更细的进步粒度；初级规则一字未动（达标 3 星、零失误 +1）保证新手手感不回归；高级靠「达标 + 零失误」即可满星，困难再加一档 `platinum`（gold×0.85）作为第 5 颗星的唯一入口，让「更快」在困难档才有意义 |
| 满星上限取「该关满星」而不是固定 3 | `calcStars` 的最后一步是 `Math.min(maxStars, stars)`，加档位/改满星只改 `TIER_BLUEPRINTS` 一处，计分函数不需要分支 |
| 结算页不再展示星级规则文案 | 玩家要看的是「这局几星」，不是「几秒对应几星」；规则说明留在文档里，失败时仍给一行失败原因（罚时与「重打本关」），因为那是玩家需要立刻知道的信息 |
| 格子底色加深 + 描边加深 | 原来 6 组底色都在 96% 亮度以上、描边 `#f0e8e4` 几乎看不见，相邻格边界糊在一起。底色压到 88% 上下、描边改成 `#e6d5cc`，边界清晰但仍是「浅色底 + 同色系数字」的观感；错误底色同步加深（否则点错的格子反而比普通格更浅） |
| 档位改名「小令 / 中调 / 长调」 | 借词乐与民歌的曲体长度命名（短→中→长），既比「初级/高级/困难」好听，又天然对应三卷的难度与尺寸递进；卷名只在 `TIER_BLUEPRINTS` 改，页面全读 `chapterTitle` |
| 引子做成独立关卡而不是首页文字说明 | 文字说明没人读，且会一直占首屏；把「按顺序点」做成 3×3 的一局，玩家在 10 秒内就懂了。它不进 `LEVELS`，所以不占星、不影响 `MAX_STARS`、不进曲集，只留一个 `tutorialDone` 标记 |
| 点过的格子默认淡墨（取消「已完成标记」开关） | 设计稿的「落墨 + ♪ 落痕」本身就是进度反馈，开关多一个决策成本；淡墨会让成绩略快，但最佳成绩按关卡存的是「更快」，不会把历史纪录冲掉 |
| 演奏页不按设计稿给「当前目标格」描橙边 | 那等于把答案圈出来，舒尔特的核心「找」就没了；橙色留给点对瞬间的动效与进度 |
| 「我的」页只留统计与设置 | 今日/最近成绩在结算页和曲集里已经能看到，重复展示只会让「我的」变成长列表；这里回答的是「我走到哪了、我怎么设置」 |
| 「我的」页成绩直接用成绩记录自带的字段 | 之前读的是不存在的 `level.name` / `result.duration`，渲染出「未知关卡 / NaN″」。改为优先用 `getLevelById` 拿「章节 · 第 N 关」，取不到时回落到记录自身的 `index`/`size`，用时统一读 `result.elapsed`——不再依赖可能对不上的关卡表 |

---

## 9. 变更日志

| 日期 | 变更 | 验证 |
| --- | --- | --- |
| 2026-10-30 | **音频系统重做**（用户四条需求：音符对不对 / 曲集加伴奏 / 版权风险 / 加公有领域名曲）：① **修音** —— `gen-songs.js` 的调性表从「只按主音查」改为 `(root, mode)` 双键（原来 `齿轮` 是 d 小调却标成「D 大调」、`夜航` 是 e 小调却标成「E 大调」）；B 段和声错位是本轮最严重的 bug —— 旋律按 `prog.reverse()` 写、和弦轨却仍用正序，bar 8–11 每个强拍都落在别的和弦上，改为 `progAt(prog, bar)` 让两者共用同一份分段进行；新增 `removeFriction` 消掉与和弦根音构成 1/6/11 半音的三类冲突（九度/十一度/十三度作为色彩音保留，全吸附到三和弦会让旋律变木）；低音轨从「每小节重复根音」改为走动低音（根–五–根–三）。② **双色关旋律缺音** —— `getNoteForValue` 两条轨共用一个下标，偶数格把旋律的下标也推走了，旋律第 2/4/6… 个音永不响；改为奇偶各自独立指针后是连续 32 音。③ **伴奏引擎** —— 新建 `services/accompaniment.ts`（只算数据：低音/铺底/琶音/轻击四声部 + 分段动态），`audio.ts` 拆出 `scheduleVoice` 与两条总线（旋律 0.90 / 伴奏 0.55 → 低通 → 同一限幅器），旋律与伴奏走同一个 lookahead 循环、全部用 `osc.start(when)` 绝对时间；**调度改用墙钟决定「排哪些事件」**，因为用 `ctx.currentTime` 算 horizon 在上下文被挂起时会死锁（currentTime 冻结 → 整首卡在第一个音）；伴奏按 `barTimes[b] = noteTimes[b*4]` 跟随玩家击键、**不做量化**。④ **名曲** —— 新增 `data/classics.ts`（欢乐颂/小步舞曲/致爱丽丝/卡农/绿袖子/茉莉花，自行记谱编配）与 `utils/classics.ts`（解锁只认战绩：24/48/72/96 星、1 张金唱片、8 关 S，全部由存档现算、不新增字段），曲集页下方加「名曲拾遗」区块；名曲只进曲集、不进关卡（进关卡要重算 `starGate` 与 `MAX_STARS=144` 的曲线）。⑤ **版权治理** —— `docs/audio-license.md` 记资产清单/生成参数/判定依据/红线，`scripts/audio-similarity.js` 用音程串（移调不变量）做最长公共子串比对、阈值 8 音。⑥ **顺带清理** —— 曲集的 `TIER_LABELS` 写死「八音盒/钢琴/电钢」但 s3a 其实是钢琴、回放还用的是用户设置音色，改为由 `song.style` 派生并在回放时临时切音色；旋律/伴奏声部分池（16/24）互不抢占；「安可曲 + 音符碎片」占位整体移除（`fragments` 与 `addFragments` 从存档删掉，我的页那一列改为金唱片），存档升 v5 加 `settings.accompaniment` | `tsc --noEmit` + `build:h5` 通过；`analyze-songs.js` 原创 6 首强拍冲突 0、名曲 6 首强拍冲突 0；`audio-similarity.js` 12 首全部 PASS；CDP 实测见 §3.3 |
| 2026-10-30 | **代码清理 + 文档拆分**（用户要求「删除无用代码、补充对应的 md 文档、拆分 readme 到 game.md、readme 只留技术开发相关」）：① 删掉 6 个完全无引用的导出 —— `services/audio.ts` 的 `getTimbre`、`store/useSaveStore.ts` 的 `selectTotalStars`、`utils/format.ts` 的 `formatRecordTime` / `isToday` / `todayKey`（连带整个 `dayjs` import，该文件只剩 `formatSeconds`）、`utils/music.ts` 的 `getPlayableNoteCount` / `midiToName`；② 收敛 5 处纯内部 `export` —— `levels.ts` 的 `GUIDE_LEVEL_ID`、`audio.ts` 的 `playChord`、`music.ts` 的 `getSongStep`、`silhouette.ts` 的 `getShapeOutline` / `toClipPolygon`；③ **刻意保留** `PatternShape` / `ShapePoint` / `SilhouetteCell` / `SaveState` / `GamePhase` / `CircleCellGeometry` / `GameEngineApi` / `PlaySongOptions` 的 `export` —— 它们出现在导出函数签名或 store 泛型里，取消导出会让公开 API 出现「无法命名的类型」，属于倒退；④ 删除孤立脚本 `scripts/convert-svg-to-png.js`（一次性任务已完成，`gen-tabbar-icons.js` 已覆盖）、`scripts/analyze-ref3.py`（一次性参考图分析），删除 `src/assets/tabbar/` 下 6 个未被引用的 `.svg`（`app.config.ts` 只用 PNG，留着容易被误当成图标源）；⑤ **文档拆分**：新建 `docs/game.md`（规则 / 卷位与卡片造型 / 星级规则 / 关卡数值表 / 功能状态 / 里程碑 / 玩家常见问题），`README.md` 只留技术栈、快速开始、部署、其他命令、开发流程、目录结构、架构与核心机制、常见改动指引、已知限制；⑥ 顺带修正 README 里三处过时内容 —— 关卡数值表更新为 `SIZE_THRESHOLDS` 的 5/8、10/15、22/32、38/55、58/82、82/115 秒与限时 12/17/37/63/94/132 秒，「已点数字只淡成墨灰」改为「只落一枚 ♪、底色与数字色都不变」，「限时 = 2 星线 × 1.5」改为 ×1.15（3×3 例外），收紧系数由「最低 70%」改为实际最紧的 85%（3 卷 × 2 轮 = 6 轮 × 3%）；⑦ `AGENTS.md` §4 新增「图案出场顺序」常量行（`ORDER` 与尺寸阶梯的配对约束），§10 文档索引补 `docs/game.md` 与三份文档的分工说明，§2 修正「星星总数是 select 出来的」的过时说法 | `npx tsc --noEmit` 通过（删除后无残留引用）；全项目 grep 确认 6 个删除项无任何调用点、`.svg` 无任何引用；`npm run build:h5` 通过 |
| 2026-10-30 | **图案卡改「图案面 + 独立线条层」**（用户反馈「直接把不规则的图案用线进行分割，上面填数字即可，不要现在一堆小卡片的样式」）：① 线不再由「格子内缩露底色」产生——那种做法的每条线都是某一格的边框，两格各让一半，缝宽随格子瘦长程度在 3~20rpx 之间乱跳，格子又是一块有底色的小多边形，所以怎么调都像「一堆小卡片」；② 新增 `buildPatternInk`：把图案面、外轮廓、所有分割线画进**一张 SVG data URI**，`stroke-width` 统一（格线 0.36、轮廓 0.85，单位是 viewBox 的 100），由 `GameGrid` 的 `.patternInk` 铺满整卡；③ 新增 `buildSeamPolylines`：直接读像素归属提边（每条内部边只出现一次）→ DP 拉直 → Chaikin 抹圆，解决「两格各画一遍会变成双线」；④ `GridCell` 新增 `ghost` 态：格子完全透明，只剩点击热区与数字，`.cell.ghost` 压过 `.tone1~6` 的底色（彩色/双色关在图案卡上只改数字颜色）；⑤ 删掉 `CELL_INSET` / `MIN_SHRINK` / `insetPolygon` / `LAYOUT_SCALE`，图案卡不再有「缝」这个概念；⑥ `CELL_SIMPLIFY_FACTOR` 0.09→0.018，格线在交汇处更贴合 | `tsc --noEmit` 通过；`preview-shapes.js` 12 图案 × 3~8 共 72 组合全部划分成功；`preview-cards.js` 截图核对：8×8 五瓣花、5×5 八角花/十字花/四角星都是**单线、等宽、连续**，图案是「一整块面 + 线 + 数字」，真机尺寸（750px 宽）下无卡片感 |
| 2026-10-30 | **图案卡改「细线稿」**（用户反馈「数字之间不要使用卡片和间隔，直接展示数字和线条间隔」「图案很不流畅」）：① `CELL_INSET` 0.007→**0.002**（缝宽 9.6rpx→2.7rpx，两格各缩一次所以缝 = 2×CELL_INSET），`LAYOUT_SCALE` 0.955→**0.988**（描边 15rpx→4rpx，仍比格线粗一档）；② 线色 `$color-pattern-line` `#e3d5bd`→**`#cfbc9e`**（线只有 1.3px 宽，原来的浅纸褐会淡到看不见）；③ 效果：整张卡从「白块拼贴的马赛克」变成「一块完整图案上画了细线」，图案轮廓与内部网格的关系终于对了；④ 顺手修 `preview-cards.js` 的方形卡：`border: 2rpx` 在纯 CSS 预览页是**非法单位、整条声明被浏览器丢弃**，导致截图里格子边框全无、♪ 看着像悬空，改用 px | `tsc --noEmit` 通过；`preview-shapes.js` 12 图案 × 3~8 共 72 组合仍全部划分成功、连通块=1；`preview-cards.js` 截图核对：水滴/心形/叶片/云朵 5×5 轮廓一眼可辨且内部只有细线，六角星 8×8 64 格线宽均匀，方形卡边框与 ♪ 位置正常 |
| 2026-10-30 | **卷三改「不规则图案卡」+ 反馈与配色调整**（用户反馈「生肖还是不好看，改成不规则图案、不要生肖这个概念、底色和前两章一致」「音符要点击后才出现」「点过变灰降低了难度和理念」「数字太黑」「彩色模式和整体不配套」「限时会不会偏长」）：① 卷三的 12 生肖整体替换为 12 个**不规则图案**（五瓣花/云朵/水滴/心形/叶片/六角星/齿轮/贝壳/葫芦/八角花/十字花/四角星），新增 `scripts/gen-pattern-shapes.js`（图元拼装 + `ring()`/`spikes()` 批量摆放）与 `src/data/patternShapes.json`，删除 `gen-zodiac-shapes.js` / `zodiacShapes.json`，代码层 `ZodiacShape`→`PatternShape`、`zodiacIndex`→`patternIndex`、`cardSilhouette`→`cardPattern`；② 图案卡底色由墨色 `#2b2724` 改纸褐 `$color-pattern-line = #e3d5bd`（与棋盘同族，三卷终于在同一张纸上）；③ **♪ 改为只在点过之后出现**（原先每格常驻一枚淡 ♪，等于把「还没点」也标了出来）；④ 删掉「点过变淡/变灰」的规则，`$color-cell-done-text` 一并移除——点过的格子只有 ♪ 一处变化；⑤ 数字色 `$color-cell-text` 由 `#2f2a24` 提浅到 `#5b544b`；⑥ 彩色模式 6 组配色换成古风低饱和（藕/杏/缃/黛/青/紫），底与字成对；⑦ 限时口径从「silver × 1.5~2」收紧到 **silver × 1.15**（3×3 例外 ×1.5），3×3~7×7 各档由 15/25/40/70/95″ 下压到 12/17/37/63/94″；8×8 因 silver 线同时从 125″ 收到 115″，限时按新口径反而是 132″（若嫌松，把系数降到 1.05 即 121″）；⑧ `preview-cards.js` 增加方形卡示例（含 ♪ 落痕），用于验收音符位置 | `tsc --noEmit` 通过；`node scripts/preview-shapes.js` 12 图案 × 3~8 尺寸共 72 组合全部划分成功、连通块均为 1、最小格 17~36rpx；`preview-cards.js` + `cdp-shot.js` 逐张核对圆盘 3/5/8、12 图案 5×5、六角星/五瓣花 8×8、五瓣花已点示例与方形卡已点示例（♪ 仅在点过的格子出现、方形卡在右下角、异形格跟在数字后） |
| 2026-10-29 | **圆形卡分格 + 生肖轮廓重做**（用户反馈「圆盘只有数字、格子连成一片」「生肖根本不像生肖」）：① 圆形卡每格从「从圆心出发的整块扇形」改为**带缝隙的圆角扇环** —— 径向留缝、角向留缝、四角用「半径在弧线两端回落」做圆角；盘面底色 `$color-circle-bg` 由 `$paper-1` 改 `$paper-2`（原来格子与盘面同色 + 无缝，整盘糊成一片）；② 弧线采样改为「圆角段固定 3 点 + 中段每 6 单位弧长一点」，8×8 单卡 clip-path 从 50KB 降到 16KB；③ 生肖数据契约从「椭圆并集」换成**一条归一化多边形**，新增 `scripts/gen-zodiac-shapes.js`（圆/椭圆/胶囊/三角拼剪影 → 栅格化 → 轮廓追踪 → Chaikin → DP → 写 JSON，自带连通块检查 + ASCII 预览 + `WRITE=1` 落盘），12 生肖按「大脑袋 + 小身体 + 短腿，特征全在耳朵/角/冠/喙/尾巴」重新设计；④ 生肖分格加**距离场过滤**：格心只落在离轮廓 ≥ `SEED_CLEARANCE` 的厚处，角/耳尖/尾巴不落格心（原来会切出放不下数字的碎片格）；⑤ 格线从 `CELL_INSET_FACTOR = 0`（等于没缝，整卡糊成一块白、生肖完全看不出）改为**内缩固定距离** `CELL_INSET = 0.007` + 整体 `LAYOUT_SCALE = 0.955`（描边比格线粗，生肖才「有轮廓」）；⑥ 数字落点改用面积形心，落在内缩多边形外时退回格心；⑦ 生肖墨色 `#2f2f33` 改暖墨 `#2b2724`；⑧ 新增 `scripts/preview-cards.js`（直接调运行时几何函数渲染静态 HTML 卡片页，用于肉眼验收） | `tsc --noEmit` 通过；`node scripts/preview-shapes.js` 72 组合全通过；`preview-cards.js` + `cdp-shot.js` 截图逐张核对圆盘 3/5/8 与 12 生肖 5×5、鼠/虎 8×8 |
| 2026-09-21 | 产出游戏大纲与技术方案（`docs/`） | 文档评审 |
| 2026-09-21 | M1 完成：36 关对局引擎、计时判错、4 个音效、星级结算、本地存档、3 个 tabBar 页 + 2 个核心二级页、排行榜占位页、青绿主题与 6 个 tabBar 图标 | 浏览器端到端 8/8 通过 |
| 2026-09-21 | 关卡结构改为尺寸逐关递增：6 关（3×3 → 8×8），按图案分 3 章（方形 / 圆形 / 生肖）；星级阈值改为按尺寸查表；数字与底色 6 组成对配色；页面改柔光背景；关卡卡片加尺寸徽标并改两列布局；修复「卡在星星门槛时继续挑战会跳到未解锁关卡」 | 浏览器端到端 9/9 通过（含 3×3 / 5×5 圆形 / 7×7 生肖三种形态） |
| 2026-09-21 | 改为无限关卡：10 轮 × 6 关 = 60 关，尺寸阶梯 × 卡片造型（方形 / 圆形 / 12 生肖）自由组合，每轮难度系数收紧 3%；新增每关限时与超时失败（失败不记档、不能跳关）；图案从「小格」上移到「整张卡片」，小格只剩数字与浅色底；点对不再改变底色只播点击动效；关卡地图改为轮次横向滚动 | 浏览器端到端 9/9 通过（含 3×3 方形 / 圆形卡 / 生肖卡、超时失败全链路） |
| 2026-09-21 | 卡片轮廓按参考图精修：圆形卡改青灰绿系（底 `#eef4f1` / 边 `#80a0a0`），生肖卡改黑白剪影风格（白底 + 灰度生肖剪影 `grayscale` / `opacity .32`），方形卡保持彩色数字 | 浏览器端到端 5/5 通过（三种卡片计算值均符合参考图实测色值） |
| 2026-09-21 | 分类收敛为初级/高级/困难三档（卡片造型不再作为分类展示，改为档位皮肤）；圆形卡从内接正方形网格改为整块圆盘分区（半径分圈 2k-1 格 × 角度分格，格子是扇环，沿圆边排一圈）；生肖卡改为生肖轮廓铺满整张卡片、数字格切不规则四边形；新增纯几何模块 `utils/cardLayout.ts`；修复上一版 `cardLayout.ts` 遗留未定义导出导致对局页编译失败 | 浏览器端到端 7/7 通过（9/36 格圆形分区半径分组正确、生肖 9 格 clip-path 互不相同、点击命中正常、无编译错误） |
| 2026-09-21 | **临时**：按用户要求关闭关卡禁用（`utils/progress.ts` 的 `UNLOCK_ALL_LEVELS = true`），测试期任意关卡可直接进入 | 待用户测试完成后改回 `false` |
| 2026-09-21 | 生肖卡重构（按 `docs/refs/3.png` 参考图的线稿风）：① 修掉轮廓生成的真 bug —— 追踪出的边界点被**排序**后才做平滑，边界顺序被打乱，导致 clip-path 一直是乱的（这是历史上「生肖形状怎么改都不对」的根因）；② 12 生肖全部重画为「侧身朝右、突出角/耳/尾/腿」的椭圆并集，单连通、面积 22%~45%；③ 分格从「格心 + 固定小方块」改为**多源 BFS 生长的 Voronoi 划分**，格子紧贴拼合、铺满整条轮廓，每格是不规则多边形；④ 视觉改墨色线稿风：卡片底色 = 墨色，格子向形心收缩留缝，缝隙露出墨色即轮廓勾边 + 格线；⑤ 删掉 `utils/cardLayout.ts`（拆成 `circleLayout.ts` + `silhouette.ts`）；⑥ 重写 `scripts/preview-shapes.js`，新增连通性 / 面积 / 各尺寸分格可行性 / Voronoi ASCII 预览四项自检 | 自检脚本 12 形状 × 6 尺寸 72 组合全通过；浏览器实测 3×3=9 格、8×8=64 格、点击推进、圆形卡无回归；qianwen-vision 读 12 张截图核验，11 个「清晰可辨」，虎为「猫科动物」 |
| 2026-09-23 | 打通 miniprogram-ci 上传链路：① 修掉上传阻塞 bug —— tabBar 图标由 `.svg` 改为 `.png`（微信小程序 tabBar 只支持 PNG/JPG，`.svg` 会被 `miniprogram-ci` 以 `Wrong file format` 拒绝），新增一次性脚本 `scripts/convert-svg-to-png.js` 转换 6 个图标并同步 `src/app.config.ts`；② `README.md` 的「编译为微信小程序」改为 miniprogram-ci 发布步骤（上传密钥 `private.wx.key`、IP 白名单、`npm run upload`、开发版本→体验版→发布、常见报错） | `npm run build:weapp` 编译通过；`npm run upload` 成功（`上传成功: { subPackageInfo: [{ name: '__FULL__', size: 668842 }] }`，版本 test1.0.0） |
| 2026-09-23 | 新增一键发布命令 `npm run release`（`config/release.js`：校验 `private.wx.key` → `npm run build:weapp` → `npm run upload`，任一步失败即中止）；`config/upload.js` 抽出 `VERSION` / `DESC` 常量并把版本号由 `test1.0.0` 规范为 `1.0.0`，补 `catch` 让失败时输出清晰错误并 `exit 1`（原先是未捕获异常堆栈） | `node --check` 语法校验通过、`package.json` JSON 校验通过；待首次实跑 `npm run release` 验证 |
| 2026-10-29 | **曲集回放改为「我的演奏」**：① 对局中把每次点对的 `getElapsed`（含罚时，所以点错后的停顿也会被还原）记进 `beatsRef`，随 `EndPayload.beats` 交给 `submitResult`；② 存档升 v4，新增 `bestRuns{ levelId → { stars, elapsed, errors, beats[] } }`，用 `isBetterRun`（星级 → 用时 → 失误）判定是否覆盖，**打崩了不覆盖最好记录**；③ `playSong` 支持 `beats`：按玩家节奏做绝对时刻调度，整体减去 `beats[0]` 去掉开局发呆的空白，超出记录的音按曲目 BPM 续播；④ 新增 `utils/beats.ts` 的 `pickSongBeats`，曲集取该曲 6 关里记录最长的一条（8×8 通了正好是完整 64 音）；⑤ 曲集右侧提示改「回放我的 / 回放原曲」、footer 说明回放口径，结算页文案同步 | `tsc --noEmit` + `build:h5` 通过；CDP 实测打一局 3×3：`bestRuns['1-1'].beats = [1335,1622,1911,2199,2484,2767,3050,3331,3617]`（间隔 280ms，与点击节奏一致）；再用「已有 3 星 3.6s」的存档慢速重打 6.97s，`isBest=0` 且 beats 保持原值 —— 覆盖规则正确 |
| 2026-10-29 | **唱片转动 + 格子细节**：① 新建 `components/Disc`（黑胶盘面 + 两道对角反光 + 朱砂标签含 ♪），首页、曲集、对局页三处共用；**同心沟槽旋转对称，光换纹路看不出转**，转动线索改为反光带与标签音符，首页 9s/圈常转、曲集回放 3.6s/圈、对局页 26s/圈慢转；② `TimerRing` 外圈改为「朱砂进度环 8rpx + 黑胶唱片层 + 纸盘数字」三层，环径 248→264rpx、数字 104→96rpx；③ `GridCell` 每个方形格右下角补淡 ♪（`0.32em`，点过后加深，异形格不印），`.cell` 显式给暖墨 `$color-cell-text = $ink-800 #2f2a24`（此前继承页面纯黑，近白格面上发硬）；④ 首页 `navigationBarTitleText` 置空去掉「舒尔特方格」，H5 端 `useEffect` 兜底 `document.title = 眼力大作战`；⑤ `scripts/cdp-shot.js` 新增 `--eval`（求值验证动画/计算样式，`out` 传 `-` 则只求值不截图） | `tsc --noEmit` 通过、`build:h5` 通过；CDP 采样确认三处唱片 `discSpin` 动画在跑且 transform 持续变化，7×7 每格 ♪ 与暖墨数字截图核对通过，引子页满圈正常 |
| 2026-10-29 | **文档同步 + 截图工具修正**：① `README.md` 全量对齐 v2 古风改版 —— 档位改「小令/中调/长调」、新增引子与顺序解锁说明、满星 144 与「通过上一关才开下一关」、功能状态表补引子/首页/我的/曲集四行、存档字段补 `tutorialDone` 与 `music`/`colorful`、常见改动指引补引子与解锁落点；② `docs/game-design.md` §3.2 改卷位结构并加引子行；③ 代码注释里的旧档位名同步（`utils/scoring.ts`、`types/game.ts`、`styles/theme.scss`）；④ 修 `scripts/seed-save.js`：Taro H5 存储是 `{"data": ...}` 双层包装，原来裸写 JSON 导致预置存档被丢弃、截图永远是空进度 | `tsc --noEmit` 通过、`build:h5` 通过（仅 sass `nth` 弃用 + 包体体积两条既有警告）；带进度截图逐页复验通过 |
| 2026-09-23 | 六项优化：① 结算页移除星级目标提示（失败仍保留失败原因）；② 修复「我的」页成绩列表（原来读不存在的 `level.name` / `result.duration`，显示成「未知关卡 / NaN″」，改为「章节 · 第 N 关」+ `result.elapsed`）；③ 档内重复关卡改为变体玩法填位 —— 新增 `GameMode`，初级/高级后 6 关倒序、困难后 6 关双色，尺寸仍 3×3→8×8 各一次（`gameEngine` 目标推进分流 + `getDoneCount`/`getCurrentTarget` 统一进度来源 + `GridCell` 加 `toneOdd/toneEven` 取色分支）；④ 6×6 起限时各 +10s；⑤ 格子底色与描边加深、错误底色同步加深；⑥ 满星改为初级 3 / 高级 4 / 困难 5（困难新增极速阈值 `gold × 0.85`，`MAX_STARS` 144）；顺带把罚时文案改成 2 位小数（原来 150ms 显示成 `0.1″`） | 浏览器端 13 项实测通过（详见 §3.3），其中双色配色首轮漏传 `alternate` 已发现并修复复验 |
| 2026-10-29 | **v2 古风改版**：① 全局沿用「乐谱纸 · 墨水与暖光」令牌，新增 `$seal`/`$ink-wash`/`$ring-track`/`$paper-desk` 与 `paper-grain`/`scroll-frame`/`seal-chip` 三个 mixin，四页统一纸纹；② 首页重做：五线谱音符依次点亮 + 朱砂印 + 宣传语「一张乐谱纸，和一场属于你的演奏」+ 当前曲目 + 三卷进度 + 主按钮，删掉三行玩法文字；③ 新增「引子」指引关（3×3、无评星、不写档、不超时失败，按进度弹引导语，通关解锁第一关），存档升 v3 加 `tutorialDone`；④ 三卷改名「小令/中调/长调」，关卡页改卷册式（总星进度、三卷签条、卷首卡、引子入口、朱砂「在此」印、虚线锁态）；⑤ 恢复顺序解锁，删除 `UNLOCK_ALL_LEVELS`；曲集改顺序开卷（未至/未收录/已收录/金唱片）并加汉字序号；⑥ 演奏页对齐设计稿：单行「曲名 · 卷名 关序」、`剩余 xx″` + `×失误` 徽章、8 段谱线加宽、格子间距/圆角/浅投影、点过淡墨 + ♪ 落痕（取消「已完成标记」开关）；⑦ 我的页删掉今日/最近成绩，改统计卡 + 声音/画面两组设置；⑧ 修复生肖卡底色丢失（`transparent` → 墨色），恢复「墨卡」观感；⑨ 新增 `scripts/cdp-shot.js` 真机视口截图/点击验证工具 | `tsc --noEmit` 通过、`build:h5` 通过；375×812 截图核对首页/关卡/曲集/我的/对局/引子，引子 9 连点后弹「引子 · 已通」，生肖卡恢复墨色底，圆形卡无回归 |
| 2026-10-14 | ① 修复「我的」页列表 `key` 警告：`GameResult` 里并没有 `id` 字段，两处列表却写 `key={result.id}`，导致全部 key 为 `undefined`；改用 `playedAt + levelId` 做 key（同一次渲染内唯一且稳定，且兼容缺 `id` 的老存档），`pages/mine/index.tsx` 改 2 行；② 排查「点开关卡后显示应用程序异常」：定位为 H5 预览服务云沙箱会话失效导致 `chunk` 404 的 `ChunkLoadError`，**非业务代码 Bug**，重启预览服务即恢复（已记入 §8 已知限制） | 重启预览服务后浏览器实测：首页→关卡→点第 1 关正常进入对局页（3×3 九格 / 当前目标 / 剩余倒计时 / 3-2-1 遮罩齐全），可通关并写档，无「应用程序异常」与 `ChunkLoadError`；「我的」页两个成绩列表正常渲染，控制台无 `unique "key" prop` 警告、无新增报错 |

---

## 10. 文档索引

| 文档 | 内容 |
| --- | --- |
| `README.md` | 面向「开发者」的项目说明：技术栈、构建、部署、架构与核心机制、常见改动指引 |
| `docs/game.md` | 面向「玩家 / 关卡设计者」的玩法文档：规则、卷位与卡片造型、星级、数值表、功能状态、里程碑 |
| `AGENTS.md`（本文） | 面向「续写者」的规范与进度台账 |
| `docs/game-design.md` | 游戏大纲：模块、关卡、通关规则、奖励、留存设计 |
| `docs/design-v2.md` | v2 视觉与音乐系统改版方案与决策记录 |
| `docs/audio-system-design.md` | 音频系统设计方案：现状体检数据、四个问题的诊断与修法、伴奏架构、名曲与解锁、实施计划 |
| `docs/audio-license.md` | 音频资产与版权说明：清单、生成参数、公有领域判定依据、红线、验收命令 |
| `docs/tech-plan.md` | 技术方案：选型、分层、核心模块设计、扩展性 |

> **文档分工**：玩法与数值写 `docs/game.md`，技术实现写 `README.md`，续写约束与决策写 `AGENTS.md`。改数值时三处都要核对 —— `game.md` 的表格、`README.md` 的「常见改动指引」、本文 §4 的常量联动表。
