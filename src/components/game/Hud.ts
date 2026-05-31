import './hud.css';

export type HudHandles = {
  setScore: (score: number, multiplier: number) => void;
  setTime: (remainingMs: number) => void;
  setCombo: (combo: number) => void;
  setMirrorState: (mirrored: boolean) => void;
  /** 多摄像头机型才显示;count<2 时按钮整体隐藏。 */
  setCameraSwitch: (info: { count: number; current: number; busy?: boolean }) => void;
  /** 画质按钮显示,label 例如 "1080p" / "自动·720p";busy 时半透明禁用。 */
  setQualityButton: (info: { label: string; busy?: boolean }) => void;
  showEnded: (info: { score: number; highScore: number; isNewHigh: boolean; reason: 'time' | 'bomb' }) => void;
  hideEnded: () => void;
  showPermissionError: (message: string) => void;
  showLoading: (message: string) => void;
  hideLoading: () => void;
  setDiagnostics: (data: {
    fps: number;
    entities: number;
    bursts: number;
    detectMs: number;
    heapMb: number | null;
  }) => void;
  showDiag: (show: boolean) => void;
  destroy: () => void;
};

export type HudCallbacks = {
  onRestart: () => void;
  onExit: () => void;
  onToggleMirror: () => void;
  onCycleCamera: () => void;
  onCycleQuality: () => void;
};

export const mountHud = (root: HTMLElement, callbacks: HudCallbacks): HudHandles => {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="hud__top">
      <div class="hud__time" data-time>60.0</div>
      <div class="hud__top-actions">
        <button class="hud__quality" type="button" data-quality aria-label="切换画质">
          <span class="hud__quality-label" data-quality-label>自动</span>
        </button>
        <button class="hud__cam" type="button" data-cam aria-label="切换摄像头" hidden>
          <span class="hud__cam-icon" aria-hidden="true">⊙</span>
          <span class="hud__cam-badge" data-cam-badge>1/1</span>
        </button>
        <button class="hud__mirror" type="button" data-mirror aria-label="镜像翻转" aria-pressed="false">⇋</button>
        <button class="hud__exit" type="button" data-exit aria-label="退出">×</button>
      </div>
    </div>
    <div class="hud__score-wrap">
      <div class="hud__score-label">SCORE</div>
      <div class="hud__score" data-score>0</div>
      <div class="hud__multiplier" data-mult></div>
    </div>
    <div class="hud__combo" data-combo aria-live="polite"></div>

    <div class="hud__loading" data-loading hidden>
      <div class="hud__loading-spinner" aria-hidden="true"></div>
      <div class="hud__loading-text" data-loading-text>正在打开摄像头…</div>
    </div>

    <div class="hud__error" data-error hidden role="alert">
      <div class="hud__error-title">来切瓜还得借一下摄像头</div>
      <div class="hud__error-msg" data-error-msg></div>
      <button class="hud__error-back" type="button" data-error-back>返回</button>
    </div>

    <div class="hud__ended" data-ended hidden>
      <div class="hud__ended-card">
        <div class="hud__ended-reason" data-ended-reason>时间到</div>
        <div class="hud__ended-score-label">本局得分</div>
        <div class="hud__ended-score" data-ended-score>0</div>
        <div class="hud__ended-high" data-ended-high>最高分 0</div>
        <div class="hud__ended-actions">
          <button class="hud__ended-btn hud__ended-btn--primary" type="button" data-restart>再来一局</button>
          <button class="hud__ended-btn" type="button" data-back>回首页</button>
        </div>
      </div>
    </div>

    <div class="hud__diag" data-diag>
      <span data-diag-fps>--</span> fps
      · <span data-diag-ent>0</span> ent
      · <span data-diag-burst>0</span> px
      · <span data-diag-mp>--</span> ms
      · <span data-diag-mem>--</span> MB
    </div>
  `;
  root.appendChild(hud);

  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    hud.querySelector(sel) as T;

  const timeEl = $('[data-time]');
  const scoreEl = $('[data-score]');
  const multEl = $('[data-mult]');
  const comboEl = $('[data-combo]');
  const loadingEl = $('[data-loading]');
  const loadingTextEl = $('[data-loading-text]');
  const errorEl = $('[data-error]');
  const errorMsgEl = $('[data-error-msg]');
  const endedEl = $('[data-ended]');
  const endedScoreEl = $('[data-ended-score]');
  const endedHighEl = $('[data-ended-high]');
  const endedReasonEl = $('[data-ended-reason]');
  const diagEl = $('[data-diag]');
  const diagFps = $('[data-diag-fps]');
  const diagEnt = $('[data-diag-ent]');
  const diagBurst = $('[data-diag-burst]');
  const diagMp = $('[data-diag-mp]');
  const diagMem = $('[data-diag-mem]');

  $<HTMLButtonElement>('[data-restart]').addEventListener('click', () => callbacks.onRestart());
  $<HTMLButtonElement>('[data-back]').addEventListener('click', () => callbacks.onExit());
  $<HTMLButtonElement>('[data-exit]').addEventListener('click', () => callbacks.onExit());
  $<HTMLButtonElement>('[data-error-back]').addEventListener('click', () => callbacks.onExit());
  const mirrorBtn = $<HTMLButtonElement>('[data-mirror]');
  mirrorBtn.addEventListener('click', () => callbacks.onToggleMirror());
  const camBtn = $<HTMLButtonElement>('[data-cam]');
  const camBadgeEl = $('[data-cam-badge]');
  camBtn.addEventListener('click', () => {
    if (camBtn.disabled) return;
    callbacks.onCycleCamera();
  });
  const qualityBtn = $<HTMLButtonElement>('[data-quality]');
  const qualityLabelEl = $('[data-quality-label]');
  qualityBtn.addEventListener('click', () => {
    if (qualityBtn.disabled) return;
    callbacks.onCycleQuality();
  });

  let lastShownScore = -1;
  let comboTimer: number | null = null;

  return {
    setScore: (score, multiplier) => {
      if (score !== lastShownScore) {
        scoreEl.textContent = String(score);
        scoreEl.classList.remove('hud__score--bump');
        // force reflow then re-add for animation
        void scoreEl.offsetWidth;
        scoreEl.classList.add('hud__score--bump');
        lastShownScore = score;
      }
      multEl.textContent = multiplier > 1 ? `×${multiplier.toFixed(1)}` : '';
      multEl.classList.toggle('hud__multiplier--active', multiplier > 1);
    },
    setTime: (remainingMs) => {
      const seconds = remainingMs / 1000;
      timeEl.textContent = seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1);
      timeEl.classList.toggle('hud__time--urgent', seconds <= 10);
    },
    setCombo: (combo) => {
      if (combo >= 2) {
        comboEl.textContent = `${combo} COMBO!`;
        comboEl.classList.add('hud__combo--show');
        if (comboTimer) window.clearTimeout(comboTimer);
        comboTimer = window.setTimeout(() => {
          comboEl.classList.remove('hud__combo--show');
        }, 1200);
      }
    },
    setMirrorState: (mirrored) => {
      mirrorBtn.setAttribute('aria-pressed', mirrored ? 'true' : 'false');
      mirrorBtn.classList.toggle('hud__mirror--on', mirrored);
    },
    setCameraSwitch: ({ count, current, busy }) => {
      // 单摄机型直接藏掉,不要占视觉位置
      if (count < 2) {
        camBtn.hidden = true;
        return;
      }
      camBtn.hidden = false;
      camBtn.disabled = !!busy;
      camBtn.classList.toggle('hud__cam--busy', !!busy);
      camBadgeEl.textContent = `${current + 1}/${count}`;
    },
    setQualityButton: ({ label, busy }) => {
      qualityBtn.disabled = !!busy;
      qualityBtn.classList.toggle('hud__quality--busy', !!busy);
      qualityLabelEl.textContent = label;
    },
    showEnded: ({ score, highScore, isNewHigh, reason }) => {
      endedScoreEl.textContent = String(score);
      endedHighEl.textContent = isNewHigh ? `新纪录! ${highScore}` : `最高分 ${highScore}`;
      endedHighEl.classList.toggle('hud__ended-high--new', isNewHigh);
      endedReasonEl.textContent = reason === 'bomb' ? '碰到炸弹了' : '时间到';
      endedEl.hidden = false;
      requestAnimationFrame(() => endedEl.classList.add('hud__ended--show'));
    },
    hideEnded: () => {
      endedEl.classList.remove('hud__ended--show');
      endedEl.hidden = true;
    },
    showPermissionError: (message) => {
      errorMsgEl.textContent = message;
      errorEl.hidden = false;
    },
    showLoading: (message) => {
      loadingTextEl.textContent = message;
      loadingEl.hidden = false;
    },
    hideLoading: () => {
      loadingEl.hidden = true;
    },
    setDiagnostics: ({ fps, entities, bursts, detectMs, heapMb }) => {
      diagFps.textContent = String(Math.round(fps));
      diagEnt.textContent = String(entities);
      diagBurst.textContent = String(bursts);
      diagMp.textContent = detectMs > 0 ? Math.round(detectMs).toString() : '--';
      diagMem.textContent = heapMb !== null ? heapMb.toFixed(0) : '--';
      // 内存接近 256MB 上限时变红
      diagEl.classList.toggle('hud__diag--warn', heapMb !== null && heapMb > 200);
      diagEl.classList.toggle('hud__diag--danger', heapMb !== null && heapMb > 320);
    },
    showDiag: (show) => {
      diagEl.classList.toggle('hud__diag--visible', show);
    },
    destroy: () => {
      if (comboTimer) window.clearTimeout(comboTimer);
      hud.remove();
    },
  };
};
