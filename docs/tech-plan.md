# 舒尔特方格闯关小游戏 · 技术方案

> 配套文档：[游戏大纲](./game-design.md)

## 1. 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | Taro 3 + React 18 | 一套代码可编译到微信小程序 / H5 / 支付宝；组件化能力成熟 |
| 语言 | TypeScript | 关卡配置、模式策略、存档结构都需要强类型约束 |
| 样式 | Sass + CSS 变量 | CSS 变量支撑运行时换肤，Sass 支撑主题 token 复用 |
| 状态 | 轻量 Store（Context + useReducer / Zustand） | 游戏状态是单机为主，无需引入重型方案 |
| 存储 | `Taro.setStorageSync` | 本地存档：星级、最佳用时、设置、成就 |
| 音频 | `Taro.createInnerAudioContext` | 小程序原生音效方案，支持静音开关 |
| 特效 | CSS 动画 + Canvas（粒子） | 轻量优先，只有通关粒子才用 Canvas |

**不选原生小程序的原因**：组件化与后续跨端（H5 用于分享传播）成本更低，且可用 React 生态。

---

## 2. 目录结构

```
shuerte/
├── config/                     # Taro 编译配置
├── src/
│   ├── app.tsx / app.config.ts / app.scss
│   ├── pages/                  # 路由（薄，仅做组装）
│   │   ├── home/               # 大厅
│   │   ├── levels/             # 关卡地图
│   │   ├── game/               # 对局
│   │   ├── result/             # 结算
│   │   ├── rank/               # 排行榜
│   │   └── profile/            # 个人中心 / 成就
│   ├── components/             # 纯展示组件（可复用、无业务副作用）
│   │   ├── Grid/               # N×N 方格容器
│   │   ├── Cell/               # 单个格子
│   │   ├── TimerBar/           # 计时 / 进度条
│   │   ├── TargetHint/         # 当前目标数字提示
│   │   ├── StarRating/         # 星级展示
│   │   ├── LevelCard/          # 关卡卡片
│   │   ├── ResultModal/        # 结算弹层
│   │   ├── ParticleLayer/      # 通关粒子层
│   │   └── ThemeProvider/      # 主题注入
│   ├── core/                   # 纯逻辑，零 UI 依赖，可单测
│   │   ├── shuffle.ts          # Fisher-Yates 洗牌
│   │   ├── gameEngine.ts       # 状态机（核心）
│   │   ├── scoring.ts          # 星级 / 罚时计算
│   │   ├── achievements.ts     # 成就判定
│   │   └── modes/              # 模式策略（可插拔）
│   ├── store/                  # 全局状态 + 存档读写
│   ├── services/
│   │   ├── audio.ts            # 音效管理器
│   │   ├── haptics.ts          # 震动
│   │   ├── storage.ts          # 存档（含版本迁移）
│   │   └── rank.ts             # 排行榜数据源（本地/远端可切）
│   ├── config/
│   │   ├── levels.ts           # 关卡数据（配置驱动）
│   │   ├── themes.ts           # 主题 token
│   │   └── achievements.ts     # 成就定义
│   ├── assets/ (sounds / images)
│   └── styles/
```

**分层约束**：`pages` 只做组装，`components` 不碰业务，`core` 不碰 UI。三者边界清晰 = 后续加 6×6/7×7 或新模式时改动能收敛在 `config` + `modes`。

---

## 3. 架构分层

```
配置层  config/levels.ts   ← 关卡数据（尺寸/排列/模式/阈值）
   ↓
逻辑层  core/gameEngine    ← 状态机 + 计时 + 判错（纯函数，可单测）
   ↓
服务层  services/*         ← 音效 / 震动 / 存档 / 排行（平台能力封装）
   ↓
视图层  pages + components ← 只负责渲染与事件上抛
```

数据单向流动：`UI 事件 → Engine.dispatch() → 新状态 → UI 重渲染`。音效、震动、存档都是**引擎事件的订阅者**，不在点击回调里散落调用。

---

## 4. 核心模块设计

### 4.1 关卡配置（配置驱动）

```ts
export interface LevelConfig {
  id: string              // 'ch1-01'
  chapter: number
  index: number           // 章内序号
  size: number            // 5 | 6 | 7
  order: 'asc' | 'desc'   // 正序 / 倒序
  mode: 'classic' | 'dualColor' | 'timeLimit' | 'shuffle'
  arrange?: 'random' | 'spiral' | 'snake'
  thresholds: { gold: number; silver: number }  // 毫秒
  timeLimit?: number      // 仅 timeLimit 模式
  starGate: number        // 进入本章所需累计星数
}
```

新增 8×8、新排列、新模式 **只改这个文件**，不动核心逻辑。

### 4.2 游戏状态机

```
idle → countdown(3,2,1) → playing → finished
                            ↓
                          paused ⇄ playing
                            ↓
                          failed（仅限时关）
```

`gameEngine.ts` 暴露四个动作：`start()` / `tap(index)` / `pause()` / `resume()`，每次产出不可变的新状态快照。

### 4.3 数字生成

Fisher-Yates 洗牌保证均匀分布；每日挑战使用**日期哈希作为随机种子**，保证当天所有玩家题目一致。

```ts
function seededShuffle<T>(arr: T[], seed: number): T[]
```

### 4.4 计时精度

**不用 `setInterval` 累加**（小程序定时器会漂移、切后台会被节流）。方案：

- 起点记录 `startedAt = Date.now()`
- 仅用 `setInterval(50ms)` 触发**重渲染**，显示值 = `Date.now() - startedAt + penalty`
- 暂停时记录累计暂停时长，恢复后从新的基准点续算

结果：无论定时器怎么漂移，最终用时都准确。

### 4.5 音效管理（services/audio.ts）

- 启动时预创建 `InnerAudioContext` 实例池（click / error / success / tick），避免首次播放延迟
- 支持全局静音开关 + 跟随系统静音（`obeyMuteSwitch`）
- 页面卸载统一 `destroy()`，防止内存泄漏
- 音频体积控制：单文件 < 30KB，总资源 < 150KB（小程序包体约束）
- **资源缺失时降级**：音效不存在则跳过并静默记录，不阻塞玩法（音效属于增强，不属于契约）

### 4.6 震动（services/haptics.ts）

`Taro.vibrateShort()` 仅用于"点击错误"和"通关"，正确点击不震动（高频震动会使体验变廉价）。

### 4.7 动画方案

| 场景 | 方案 |
| --- | --- |
| 格子点击反馈 | CSS `transform: scale()` + transition |
| 错误红闪 | CSS keyframes animation |
| 星级弹出 | CSS 依次 `animation-delay` |
| 通关粒子 | Canvas 2D，单次播放后销毁，避免常驻占用 |

原则：能用 CSS 就不用 Canvas；Canvas 只在单次特效时启用。

### 4.8 主题系统（支撑后续换肤）

```ts
export interface Theme {
  id: string
  bg: string            // 背景（渐变/图案/图片）
  cellNormal: string
  cellDone: string
  cellError: string
  cellTarget: string
  textPrimary: string
  accent: string
}
```

在根节点挂 `theme-${id}` class，配合 CSS 变量，换肤无需重新渲染组件树。

### 4.9 本地存档

```ts
interface SaveData {
  version: number                       // 便于后续结构迁移
  stars: Record<string, number>         // levelId -> 星级
  bestTimes: Record<string, number>     // levelId -> 最佳用时
  totalGames: number
  streakDays: number
  lastPlayedDate: string
  achievements: string[]
  settings: { sound: boolean; haptics: boolean; theme: string }
}
```

`storage.ts` 内做 `version` 判断与默认值补齐，后续加字段不会让老用户存档失效。

### 4.10 排行榜（分阶段，先本地后云端）

| 阶段 | 方案 | 说明 |
| --- | --- | --- |
| M1 | 纯本地 | 仅个人最佳记录，无网络依赖 |
| M3 | 微信云开发 | 云数据库 + 云函数；成绩上报时服务端校验时间戳间隔合理性，防作弊 |
| 备选 | 自建 Spring Boot + MySQL | 更可控，可做周榜/赛季/数据分析 |

`services/rank.ts` 定义统一接口（`submitScore` / `fetchRank`），实现可切换，上层无感知。

---

## 5. 组件拆分

| 组件 | 职责 | 关键 Props |
| --- | --- | --- |
| `Grid` | 网格布局，按 size 计算行列 | `size`, `cells`, `onTap` |
| `Cell` | 单格渲染（`React.memo`） | `value`, `state`, `onTap` |
| `TimerBar` | 计时显示 / 限时进度 | `elapsed`, `limit?` |
| `TargetHint` | 当前目标数字 | `target` |
| `StarRating` | 星级展示（含弹出动画） | `stars`, `animate` |
| `LevelCard` | 关卡卡片（星级/最佳/锁态） | `level`, `record`, `locked` |
| `ResultModal` | 结算弹层 | `result`, `onRetry`, `onNext` |
| `ParticleLayer` | 通关粒子特效 | `trigger` |
| `ThemeProvider` | 主题注入 | `themeId` |

**性能要点**：7×7 = 49 个格子，每次点击若全量重渲染会明显掉帧。做法是：

1. `Cell` 用 `React.memo` + 只传原始值 props
2. 点击只变更**两个**格子的状态对象（原格子、新格子），其余引用不变 → 只有 2 个格子重渲染
3. 计时器独立成组件订阅时间，避免每 50ms 把整个方格树重渲染

---

## 6. 关键数据模型

```ts
export interface Cell {
  value: number
  state: 'idle' | 'done' | 'error'
}

export interface GameState {
  phase: 'idle' | 'countdown' | 'playing' | 'paused' | 'finished' | 'failed'
  level: LevelConfig
  cells: Cell[]
  target: number
  errors: number
  penalty: number      // 罚时累计（毫秒）
  startedAt: number | null
  elapsed: number
  pausedTotal: number
}

export interface GameResult {
  levelId: string
  elapsed: number
  errors: number
  stars: number
  isBest: boolean
  isBestGlobal: boolean
}
```

---

## 7. 性能与兼容

- **包体**：音频 + 图片资源控制在 300KB 内，优先本地资源
- **渲染**：见 §5，重点是避免全量重渲染
- **后台切换**：监听页面 `onHide` 自动暂停，防止"切后台刷时间"
- **兼容**：以微信小程序为主，代码避免依赖 H5 独有 API；`audio` 等在 H5 下走降级分支
- **异常**：只有音效/震动这类**增强能力**允许静默降级；存档读写失败、配置缺失等属于契约问题，需显式抛出并暴露

---

## 8. 扩展性设计（对应"后续持续迭代"）

| 需求 | 扩展方式 | 改动范围 |
| --- | --- | --- |
| 新增 6×6 / 7×7 / 8×8 | `levels.ts` 加配置 | 零代码改动 |
| 新增玩法（倒序、双色、变位） | `core/modes/` 加策略实现 | 新增 1 个文件 |
| 换肤 / 背景图案 | `themes.ts` + CSS 变量 | 新增 1 个 token 集合 |
| 新增音效 | `services/audio.ts` 注册表 + 资源文件 | 局部 |
| 成就 / 奖励扩展 | `config/achievements.ts` 加规则 | 零核心改动 |
| 接入排行榜后端 | `services/rank.ts` 换实现 | 局部 |

**设计准则**：玩法 = 配置 + 策略；表现 = 主题 token；平台能力 = service 封装。三条线各自独立，互不污染。

---

## 9. 开发流程与调试方式

1. **开发**：在当前 IDE 内完成，代码直接落在本项目目录。
2. **预览**：通过内置预览服务实时查看效果（浏览器形态，改完即刷新），支持在浏览器中模拟点击、验证计时与音效逻辑。
3. **真机调试**：预览服务提供二维码，用微信扫码即可在手机上体验真实交互（音效、震动、性能）。
4. **无需额外安装任何开发者工具**，全流程在本环境闭环。

---

## 10. 里程碑

| 里程碑 | 内容 | 验收标准 |
| --- | --- | --- |
| **M1 · MVP** | 三档难度（初级/高级/困难）× 12 关 = 36 关；尺寸 3×3 → 8×8；三种卡片造型与分区布局（方形网格 / 圆盘扇环 / 生肖轮廓内 Voronoi 分格）；每关限时与超时失败；计时、错误提示音、结算与星级、本地存档、关卡地图 | 36 关全部可玩，成绩本地留存 |
| **M2 · 表现层** | 音效体系、震动、主题换肤、通关特效、成就系统 | 视觉与反馈达到"愿意截图分享"的水准 |
| **M3 · 社交化** | 每日挑战、排行榜（云端）、分享海报、连胜签到 | 具备自传播与日常回访能力 |

三个里程碑共用同一套架构，M1 的组件与引擎在 M2/M3 不做结构性重写。
