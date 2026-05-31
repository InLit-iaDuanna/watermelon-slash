# 切瓜! · Watermelon Slash

iPhone Safari 上打开,用真手切西瓜的 AR 网页游戏。

夏夜霓虹西瓜摊主题 · 60 秒挑战 · 食指挥过西瓜即可切开 · 小心炸弹。

## 工作原理

不是 WebXR/LiDAR(iOS Safari 至今没实装),用的是:

- `getUserMedia` 拿摄像头流当背景
- MediaPipe Tasks Vision `HandLandmarker` 识别手部 21 个关键点,取食指指尖(landmark 8)
- Three.js 在摄像头画面上叠加 3D 西瓜
- 食指指尖速度 + 轨迹与西瓜碰撞检测,命中后切成两半 + 喷溅果汁粒子

视觉是 camera passthrough AR — 用户看到自己的手挥过去切西瓜,体感等同 AR。

## 本地开发

需要 Node 18+ 和 pnpm。

```bash
pnpm install
pnpm dev          # 仅 localhost (HTTP 也行,localhost 例外)
pnpm dev:https    # 生成本地 mkcert 证书,可在同 LAN 的 iPhone 测试
```

iPhone 测试步骤:
1. 在 Mac 上跑 `pnpm dev:https`
2. 看 Vite 输出的 `https://192.168.x.x:5173/` 这种 LAN 地址
3. 第一次访问 iPhone 会警告证书不可信 → 进入 设置 → 通用 → 关于本机 → 证书信任设置 启用 mkcert 根证书

## 部署

`vercel.json` 已配 CSP / Permissions-Policy:

```bash
pnpm build       # 产出到 dist/
vercel deploy    # 或推到 Vercel git 集成
```

MediaPipe wasm 和模型权重已经自托管在 `public/mediapipe/` 下,运行期完全同源,CSP 不放行任何外部资源。

如果要升级模型版本:替换 `public/mediapipe/hand_landmarker.task` 后,把 `src/lib/hand-tracker.ts` 里的 `DEFAULT_MODEL_URL` 改成带版本号的路径(例如 `/mediapipe/hand_landmarker.v2.task`)以触发缓存失效。

## 工程结构

```
src/
├── components/
│   ├── landing/   # 落地页(夏夜霓虹 hero + 权限引导 CTA)
│   └── game/      # 游戏视图 + HUD
├── game/          # Three.js 场景、实体、物理、粒子、生成器、状态机
├── lib/           # 摄像头、手部识别、轨迹、数学、SFX、设备检测
├── styles/        # global.css + tokens.css
└── main.ts        # 入口:landing ↔ game 路由
```

## 调参

`src/lib/constants.ts` 里所有可调节的旋钮:
- `GAME_DURATION_MS` — 单局时长
- `SLICE_SPEED_THRESHOLD` — 指尖速度阈值(太低误切,太高难触发)
- `HAND_INFERENCE_STRIDE` — MediaPipe 推理隔几帧跑一次(2 = 隔帧;低端机改 3 提帧率)
- `MAX_DEVICE_PIXEL_RATIO` — 渲染分辨率上限
- `BOMB_PROBABILITY` — 炸弹出现概率
- 出生速度、重力、轨迹长度等

> 如果遇到闪退,把 URL 改成 `https://....?debug` 进入,左下角会显示 fps / 实体数 / 粒子组数 / 手部识别耗时 / JS heap MB,截图发给排查。

## 已知限制

- iPhone 12 以下机型 MediaPipe 帧率较低,体感会有延迟
- 强逆光环境下手部识别置信度下降
- 后置摄像头 + 镜像翻转的视频背景适合"摄像头朝外"使用;前置摄像头的情况下视觉会感觉镜像奇怪(但碰撞检测仍然正确,因为指尖坐标也跟着翻)

## 项目规范

### 目录与文件

- 按 feature 分组,不按类型分组:`components/landing`、`components/game`、`game/`、`lib/`、`styles/`
- 单文件典型 200-400 行,上限 800 行;函数 <50 行
- 模块职责单一,工具往 `lib/` 抽,场景与实体往 `game/` 抽

### 命名约定

- 组件 / 类:`PascalCase`(`HudOverlay`、`MelonEntity`)
- hook 与工具函数:`camelCase`(`useHandTracker`、`spawnEntity`)
- CSS 类:kebab-case 或 BEM-ish(`.hud`、`.hud__score`、`.hud__score--combo`)
- 常量:`UPPER_SNAKE_CASE`(`GAME_DURATION_MS`)
- 布尔:`is` / `has` / `should` / `can` 前缀

### 类型与不可变性

- 导出 API 必有显式类型;内部局部变量让 TS 推断
- 严禁 `any`;外部边界用 `unknown`,在 `catch` 里 narrowing 后再用
- 状态更新返回新对象,不就地修改;`game/state.ts` 走 reducer 风格
- 可调参数全部进 `src/lib/constants.ts`,feature 代码不写魔法数字
- 摄像头、模型加载等外部失败必须给用户友好提示,不静默吞错

### Three.js 资源管理

- 每个 entity 离场必须调用 `disposeEntity`,只 dispose 它独占的 `BufferGeometry`
- 材质做模块级单例共享,**不要**在 entity 上 dispose,否则下一次复用会拿到 disposed material
- 纹理同理:加载一次,在模块退出时统一释放
- 新增实体时同步补齐 dispose 路径,泄漏一次很难定位

### 动画与样式

- 只动 `transform` / `opacity` / `filter`;禁止动 `width` / `height` / `top` / `left` / `margin`
- 设计 token 走 `src/styles/tokens.css`;颜色/间距/字号不在组件里硬写
- 语义 HTML 优先(`<header>` / `<main>` / `<button>`),不堆 `<div>`

### 摄像头与音频权限

- `getUserMedia` 与 `AudioContext` **必须**在用户 gesture 回调里启动,否则 iOS Safari 直接拒绝
- landing 页的 CTA 是唯一入口;游戏视图不要在 mount 时偷偷申请权限
- LAN 调试必须 HTTPS;走 `pnpm dev:https`(mkcert),http 在真机上拿不到摄像头

### 测试

- `pnpm test` 跑 vitest
- 纯函数模块必有单测:`lib/math.ts`、`lib/trail.ts`、`game/state.ts`、`game/spawner.ts`
- Three.js / MediaPipe / DOM 相关只做手测,不写脆的快照

### 性能与 CSP

- landing 主 chunk gzip 后 <80kb;Three.js 与 MediaPipe 走 `import()` 动态切片,不进首屏
- `MAX_DEVICE_PIXEL_RATIO`、`HAND_INFERENCE_STRIDE` 是低端机的两个调速旋钮
- `vercel.json` 的 CSP 已限制可加载源;新增任何外部脚本/wasm/模型必须**同时**更新 CSP 白名单

## 参考

- MediaPipe HandLandmarker: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
- Three.js: https://threejs.org
- 灵感来源:开源 [collidingScopes/threejs-handtracking-101](https://github.com/collidingScopes/threejs-handtracking-101)
