import './landing.css';
import { detectCapabilities } from '../../lib/device';
import { primeAudio } from '../../lib/audio';

export type LandingProps = {
  onStart: () => void;
};

/**
 * Landing page — 夏夜霓虹西瓜摊
 * Anti-template: typographic hero with mixed-color title,
 * floating ambient decorations, single oversized CTA that
 * primes camera + audio in the same user gesture.
 */
export const mountLanding = (root: HTMLElement, props: LandingProps): void => {
  const caps = detectCapabilities();

  const wrap = document.createElement('section');
  wrap.className = 'landing';
  wrap.setAttribute('aria-labelledby', 'landing-title');

  wrap.innerHTML = `
    <header class="landing__brand">
      <span class="landing__brand-dot" aria-hidden="true"></span>
      <span>夜市第 27 摊 · 自助切瓜</span>
    </header>

    <div class="landing__hero">
      <span class="landing__eyebrow">· AR · HAND TRACKING ·</span>
      <h1 class="landing__title" id="landing-title">
        <span class="landing__title-cut">切</span><span class="landing__title-melon">瓜</span><span class="landing__title-bang">!</span>
      </h1>
      <p class="landing__sub">
        把手伸到摄像头前,用食指挥过去,在 60 秒里切尽夏夜霓虹下飞出来的西瓜。
      </p>
      <ul class="landing__lines" aria-label="玩法说明">
        <li>授予摄像头权限,后置摄像头会朝你的手</li>
        <li>食指快速挥过西瓜即可切开,慢动作不算</li>
        <li>炸弹会闪粉光,千万不要碰</li>
      </ul>
    </div>

    <div class="landing__cta-wrap">
      ${
        caps.ok
          ? `<button class="landing__cta" type="button" data-action="start" aria-describedby="landing-hint">开始切瓜</button>
             <p class="landing__hint" id="landing-hint">点击后会请求摄像头权限 · 画面只在本机处理,不上传</p>`
          : `<div class="landing__fallback" role="alert">
               <div class="landing__fallback-title">这个设备暂时玩不了</div>
               <div>${caps.camera ? '' : '需要摄像头权限。'}${caps.webgl2 ? '' : '需要 WebGL2 支持。'}请在 iPhone Safari 或新版桌面浏览器里打开。</div>
             </div>`
      }
    </div>

    <span class="landing__deco landing__deco--top-right" aria-hidden="true"></span>
    <span class="landing__deco landing__deco--bottom-left" aria-hidden="true"></span>
  `;

  root.appendChild(wrap);

  const cta = wrap.querySelector<HTMLButtonElement>('[data-action="start"]');
  cta?.addEventListener('click', () => {
    // 必须在 user gesture 内激活 AudioContext,否则 iOS 永远是 suspended。
    primeAudio();
    props.onStart();
  });
};
