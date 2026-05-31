# 交接文档 · 切瓜! Watermelon Slash

> 给接手的 Claude Code CLI / 任何下一位开发者
> 上一位:Claude (Opus 4.7),2026-05-29 第一次会话搭完整骨架
> 第二位:Claude (Opus 4.7),2026-05-29 同日续会话,把代码层面验证跑通
> 项目状态:**typecheck / build / dev server 三件套都过了,差真机视觉验证**

---

## TL;DR(30 秒读完)

- 项目:iPhone Safari 上打开,**用真手切西瓜**的 AR 网页游戏
- 路线:**摄像头 + MediaPipe Hands + Three.js**(不是 WebXR,不是 LiDAR)
- 状态:**8 个 Phase 全部写完 + 代码层面验收已过**
  - ✅ `pnpm install`(esbuild 已在 `pnpm.onlyBuiltDependencies` 白名单)
  - ✅ `pnpm typecheck` 干净通过(只修了一处 unused import)
  - ✅ `pnpm build` 干净通过(gzip:three 117KB / mediapipe 40KB / app 9KB)
  - ✅ `pnpm dev` 起得来,localhost 能渲染落地页 HTML
  - ⏳ 真机摄像头/手势/切瓜流程**仍未验证**
- 用户母语:**中文**,UI 和回复都用中文
- 用户要求的视觉风格:**夏夜霓虹西瓜摊**(深夜紫底 + 西瓜红 + 霓虹黄)

**接手人下一件事**:`pnpm dev:https`(会被要 sudo 装 mkcert 根证书),然后 iPhone 同 LAN 真机测一遍。

---

## 用户上下文

| 项 | 内容 |
|---|---|
| 工作目录 | `/Users/isduanna/Documents/hks` |
| 系统 | macOS (Darwin 24.6.0) |
| Shell | zsh |
| 语言偏好 | **中文回复**,代码注释和文档都中文 |
| 决策风格 | 抓大放小,会被反问、会改主意,喜欢"先确认再开工" |
| 已确认的需求决策 | 见下方"已锁定的产品决策" |

---

## 已锁定的产品决策(用户已确认,不要再问)

| 维度 | 决策 |
|---|---|
| 切瓜手势 | **食指指尖轨迹**(取 MediaPipe landmark 8 的速度+轨迹) |
| 西瓜出现方式 | **底部抛入**,水果忍者式抛物线 |
| 视觉风格 | **夏夜霓虹西瓜摊**(深夜紫底 + 西瓜红 + 霓虹黄 + 瓜皮绿) |
| 里程碑目标 | **M2 完整可玩切瓜**(含 60s 倒计时 + Combo + 炸弹 + 本地最高分) |
| 工程路线 | **B 方案 — 从零搭建**(Vite + TS + Three.js + MediaPipe),非 fork 模板 |
| AR 实现 | **Camera passthrough**(摄像头视频背景 + 屏幕空间 3D 叠加),**不**用 WebXR、**不**调 LiDAR |
| 后端 | **无**,纯本地,localStorage 存最高分 |

不要再问以上问题。如果用户想改,他会主动提。

---

## 用户提过的关键问题与答案(避免重复研究)

> 用户问:"iPhone 不是有 AR 功能?他的雷达?"

**正确答复(已给过)**:
1. 那是 **LiDAR**(激光雷达,ToF 测距),只有 Pro/Pro Max 机型有
2. **iPhone Safari 在 2026 年仍然完全摸不到 LiDAR**:
   - WebXR `immersive-ar` 在 iOS Safari 至今未实装(Apple Developer Forums 2024 明确说"non-functional flag")
   - caniuse.com 显示 Safari iOS 全版本 "Not supported"
   - Safari 26.1 release notes 没有 WebXR / depth sensing 条目
   - WebXR Depth Sensing Module 只在 Android Chrome 上能用
3. 即使能调,LiDAR 给的是**场景深度**不是**手部骨骼关节**——对切瓜没用
4. 正确路径就是 **MediaPipe Hands(RGB 摄像头 + ML)**

如果用户再问"为什么不用 LiDAR / WebXR / ARKit",直接给上面这套回答,不要重新搜。

---

## 工程结构

```
hks/
├── package.json              # pnpm + vite + three + @mediapipe/tasks-vision
├── tsconfig.json             # strict + noUnusedLocals + noUnusedParameters
├── vite.config.ts            # vite-plugin-mkcert 用于本地 HTTPS
├── vercel.json               # 部署配置 + CSP + Permissions-Policy
├── index.html                # 视口锁竖屏 + iOS PWA meta
├── README.md                 # 用户向 README
├── .prettierrc.json · .gitignore
└── src/
    ├── main.ts                                # 入口,landing ↔ game 路由
    ├── styles/
    │   ├── global.css                         # 全局重置 + 100dvh + reduced-motion
    │   └── tokens.css                         # 设计 token(夏夜霓虹色板 + 字号 + 间距)
    ├── components/
    │   ├── landing/
    │   │   ├── Landing.ts                     # 落地页,CTA 触发摄像头+音频权限
    │   │   └── landing.css
    │   └── game/
    │       ├── Game.ts                        # 主游戏视图(整合 scene/tracker/state/HUD)
    │       ├── Hud.ts                         # HUD 计分/倒计时/Combo/结算页
    │       └── hud.css
    ├── game/
    │   ├── scene.ts                           # Three.js 正交相机 + 视频背景平面
    │   ├── watermelon-mesh.ts                 # 程序化西瓜/半瓜/炸弹模型 + 自定义 shader
    │   ├── entities.ts                        # 实体物理(欧拉积分 + 重力)
    │   ├── spawner.ts                         # 生成器(难度递增 + bomb 概率)
    │   ├── particles.ts                       # 果汁粒子(GPU points,加性混合)
    │   ├── trail-renderer.ts                  # 指尖拖尾发光线 strip
    │   └── state.ts                           # 游戏状态机 + 计分 + Combo + localStorage
    └── lib/
        ├── camera.ts                          # getUserMedia(后置优先 → fallback 任意)
        ├── hand-tracker.ts                    # MediaPipe HandLandmarker 包装(GPU delegate)
        ├── trail.ts                           # 指尖轨迹缓冲 + 切割碰撞算法(线段-圆距离)
        ├── sfx.ts                             # WebAudio 合成 SFX(无音频文件)
        ├── constants.ts                       # 所有可调旋钮集中处
        ├── math.ts                            # clamp/lerp/dist/segment 距离
        ├── device.ts                          # 能力检测(camera + WebGL2)
        └── event-bus.ts                       # 类型安全的小事件总线
```

---

## 关键架构决策(避免推翻重写)

### 1. 不用 React / r3f
原生 Three.js + 函数式组件。理由:UI 状态简单,r3f 增加 React 依赖与包体,不值得。

### 2. 切割实现:预制半瓜 swap-in,**不**做运行时 mesh cutting
碰撞命中时:销毁整瓜 → 生成两个 hemisphere mesh(带 pink 平面盖)→ 沿切线方向给初速度。
理由:运行时 mesh cutting 复杂、性能差,视觉收益小。

### 3. 物理:简单欧拉 + 重力,**不**用 rapier/cannon-es
切瓜实体之间无碰撞,只需抛物线。
理由:省 ~200KB WASM 依赖,iOS Safari 上更轻。

### 4. 坐标系约定(全工程统一)
- **MediaPipe**:`(0..1, 0..1)`,左上原点
- **Three.js scene**:`x ∈ [-aspect, aspect]`,`y ∈ [-1, 1]`,中心原点,**+y 向上**
- **视频背景平面**已 `scale.x *= -1` 镜像,所以 `Game.ts` 里 `tipToScene()` 也要 `(1 - tip.x)` 翻转 x,让指尖跟手

### 5. MediaPipe 性能优化
- **GPU delegate**(WebGL2)
- **隔帧推理**(`HAND_INFERENCE_STRIDE = 2`)
- **EMA 平滑**(`FINGERTIP_SMOOTH_ALPHA = 0.55`)消抖
- **VIDEO mode + 单调时间戳**(MediaPipe 强制要求)

### 6. 音频
WebAudio API 合成的程序化 SFX,**没有任何音频文件依赖**。
`AudioContext` 在 Landing 的 CTA 点击中预初始化(iOS 必须用户手势)。

### 7. CSP 配置
`vercel.json` 里允许:
- `cdn.jsdelivr.net` — MediaPipe wasm
- `storage.googleapis.com` — MediaPipe 模型权重
- `'wasm-unsafe-eval'` — MediaPipe 必需

如果要自托管,把这两个域去掉,把模型放到 `public/`。

---

## 已知风险与未验证项

### 🟢 已验证(第二次会话,2026-05-29)

1. **`pnpm install` + `pnpm typecheck` + `pnpm build`** — 全部通过
   - MediaPipe 0.10.18 的导出名都对得上,`hand-tracker.ts` 没改
   - `Game.ts` 里 `resetRound` 的 TDZ 顺序问题:typecheck 没爆,运行时是否真的不报 ReferenceError 仍待真机/浏览器跑一次
   - 唯一改动:`src/game/entities.ts` 删掉了 `randSign` 的 unused import
   - 配置改动:
     - `package.json` 加了 `pnpm.onlyBuiltDependencies: ["esbuild"]`(否则 pnpm 11 会拒装 esbuild postinstall)
     - `vite.config.ts` 让 mkcert 插件改为 `VITE_HTTPS=1` 时才挂载,普通 `pnpm dev` 走 HTTP(避开 sudo)
     - `package.json` 的 `dev:https` 脚本改成 `VITE_HTTPS=1 vite --host`(vite 6 已经废了 `--https` flag,mkcert 插件自己接管 HTTPS)

2. **`pnpm dev` 起得来,落地页 HTML 路由 200 OK**
   - 浏览器视觉/交互**没**验证(沙箱里没头浏览器)
   - 接手人在自己的浏览器里打开 `http://localhost:5173/` 看一眼,确认霓虹西瓜摊视觉、CTA 按钮存在

### 🔴 必须验证(接手人下一波)

3. **iPhone 真机授权摄像头并看到自己的画面 + 食指尖发光线**
   - 跑 `pnpm dev:https`(系统会弹 sudo 装 mkcert CA,**用户输自己的密码**)
   - 拿 Vite 输出的 LAN 地址(`https://192.168.x.x:5173`)在 iPhone 同 Wi-Fi 上打开
   - iPhone 第一次会警告证书:**设置 → 通用 → 关于本机 → 证书信任设置 → 启用 mkcert 根证书**

4. **`Game.ts` 里的回调闭包顺序**(typecheck 过 ≠ 运行时过)
   - `mountHud(wrap, { onRestart, onExit })` 中 `onRestart` 调用 `resetRound`,但 `resetRound` 在 hud 之后定义
   - 进游戏页一旦点"重玩"就能验证;**如果报 ReferenceError,把 `resetRound` 移到 `mountHud` 调用之前**

5. **视频背景的 cover 缩放**
   - `scene.ts:applyVideoCover()` 重写过两次,真机上检查横竖屏切换、视频是否布满、是否有黑边

### 🟡 中等风险

6. **MediaPipe iOS Safari 性能**
   - iPhone 13+ 预期 25-30 FPS,iPhone X 可能 5-10 FPS
   - 如果太卡:把 `HAND_INFERENCE_STRIDE` 调到 3,视频喂进去之前先缩到 320×240

7. **碰撞检测阈值**
   - `SLICE_SPEED_THRESHOLD = 1.4`(units/sec)是凭感觉定的,真机上手感不对就调 `src/lib/constants.ts`

8. **`<canvas>` 全屏在 iOS Safari 的 100dvh 表现**
   - 已用 `position: fixed; height: 100dvh; touch-action: none`
   - 仍可能因 Safari 地址栏伸缩造成跳动,真机验证

### 🟢 低风险

9. CSP 中 jsdelivr.net 在国内访问可能慢——后续可以把 MediaPipe wasm 自托管。

---

## 任务跟踪

8 个开发 Phase 在第一次会话里全部标完成:

| # | 状态 | Phase |
|---|---|---|
| 1 | ✅ | 项目搭建(Vite + TS + three.js + MediaPipe) |
| 2 | ✅ | 落地页 + 权限引导 |
| 3 | ✅ | 摄像头视频背景 + MediaPipe 手部识别 |
| 4 | ✅ | 西瓜模型 + 抛物线物理 |
| 5 | ✅ | 切割检测 + 切开特效 |
| 6 | ✅ | 游戏循环(60s 倒计时 + Combo + 炸弹 + 最高分) |
| 7 | ✅ | 视觉打磨 + 性能 |
| 8 | ✅ | 部署(Vercel + HTTPS + CSP) |

代码层面验收(第二次会话):

| # | 状态 | 验收 |
|---|---|---|
| A | ✅ | `pnpm install` + `pnpm typecheck` 通过 |
| B | ✅ | `pnpm dev` 起得来,落地页 HTML 路由 200 |
| C | ✅ | `pnpm build` 生产构建通过 |
| D | ⏳ | iPhone 真机授权摄像头 + 看到自己 + 指尖发光线 |
| E | ⏳ | 真机切瓜命中 + 计分 + Combo + 炸弹 GameOver + 重玩 |
| F | ⏳ | Vercel 部署成功,真机 HTTPS 链接可玩 |

---

## 下一步建议路径(给接手人)

### Step 1 — 浏览器先看一眼落地页(2 分钟)

```bash
cd /Users/isduanna/Documents/hks
pnpm dev
# 打开 http://localhost:5173/ 看霓虹西瓜摊
```

如果落地页视觉有问题再回来调 `src/styles/tokens.css` 和 `src/components/landing/landing.css`。

### Step 2 — 真机 HTTPS(关键)

```bash
pnpm dev:https
```

第一次会:
1. 终端弹 sudo 密码 → 输入 → mkcert 把根 CA 装进系统钥匙串
2. 拿 Vite 输出的 LAN HTTPS 地址(`https://192.168.x.x:5173`)在 iPhone 上打开
3. iPhone 第一次会警告证书 → **设置 → 通用 → 关于本机 → 证书信任设置 → 启用 mkcert 根证书**

按"已知风险"清单逐项验证。**重点**:
- 摄像头授权流程顺不顺(CTA 一次手势同时激活 audio + camera)
- 食指指尖红线是否平滑跟手
- 切瓜阈值合不合适(切太容易 vs 切不动)
- 60s 倒计时 + Combo + 炸弹 + 最高分都跑通

### Step 3 — 部署 Vercel

```bash
pnpm build
git init && git add -A && git commit -m "feat: M2 watermelon-slash"
# Vercel git 集成,或 `vercel deploy --prod`
```

`vercel.json` CSP 已配,直接能跑。

### Step 4 — 视觉/性能微调(可选)

- iPhone 老机型卡:`HAND_INFERENCE_STRIDE = 3`
- 指尖抖:`FINGERTIP_SMOOTH_ALPHA` 调小
- 视觉单调:加 bloom 后期(目前没有,因为 iOS Safari 上 EffectComposer 性能不稳)

---

## 用户沟通建议

- 用**中文**回复
- **简洁**,不要大段铺垫,用户偏短回复
- 用户的 `/plan` 已经走完,直接干活,不要再开大计划
- 遇到要做不可逆操作(删文件、`git push --force`、装/删依赖)**先确认**
- 用户询问技术细节时,**直接给答案**,不要列五个选项让他选——他会嫌烦
- 用户说"开工"= 直接动手,不要再确认
- 用户说"再看看 / 查一下"= 用 WebSearch 实地验证,不要凭记忆答

---

## 给接手人的最后一句

代码骨架完整、逻辑闭环、风格统一,**编译/构建/dev server 全过**。**最大风险**从"没编译过"变成了"没在真浏览器/真机上跑过 UI"。接手第一件事就是 `pnpm dev`,在 Chrome/Safari 桌面打开看落地页;然后 `pnpm dev:https` + iPhone 同 LAN 真机摸一遍。

每个文件都不超过 ~250 行,职责单一,改动友好。所有可调参数集中在 `src/lib/constants.ts`,不要散到各处。

祝顺利。

— Claude Opus 4.7,2026-05-29(第一次:搭骨架;第二次:跑通编译/构建/dev)
