import { detectCapabilities } from './lib/device';
import { mountLanding } from './components/landing/Landing';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('#app root element not found');
}

type View = 'landing' | 'game';

const render = async (view: View): Promise<void> => {
  root.innerHTML = '';
  if (view === 'landing') {
    mountLanding(root, {
      onStart: () => {
        void render('game');
      },
    });
  } else {
    // 进入游戏时显示加载占位,避免 three + mediapipe 动态导入期间出现空白
    root.innerHTML =
      '<div style="position:absolute;inset:0;background:#0a0420;display:flex;align-items:center;justify-content:center;color:#fff;font-family:system-ui;font-size:14px;">正在加载游戏…</div>';
    // 动态加载 three + mediapipe,landing 阶段就不进首屏 chunk
    const { mountGame } = await import('./components/game/Game');
    root.innerHTML = '';
    mountGame(root, {
      onExit: () => {
        void render('landing');
      },
    });
  }
};

const caps = detectCapabilities();
if (!caps.ok) {
  // 即便能力检测失败仍渲染 landing,landing 自身会显示降级提示
  console.warn('[boot] capability check failed', caps);
}

void render('landing');
