/**
 * 结算页「演奏回放」动画取帧工具（仅开发期用）。
 *
 * 打一局 3×3（按 1→9 点完）→ 结算页会在 1.1~2.2 秒内把盘面按点击顺序重放一遍再碎裂，
 * 静态截图看不出动画，所以这里在关键时间点连拍几帧。
 *
 * 用法：node scripts/shot-replay.js [baseUrl] [outDir] [levelId] [total]
 *   total = 该关数字个数（3×3 传 9，8×8 传 64）
 * 前置：dist/h5 起静态服务（python -m http.server 8899）
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = path.resolve(__dirname, '..', process.argv[3] || 'docs/shots/replay');
const LEVEL = process.argv[4] || '1-1';
const TOTAL = Number(process.argv[5] || 9);

/** 取帧时刻（相对「碎片出现」的毫秒数） */
const FRAMES = [80, 220, 400, 620, 1100];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (p, init) => (await fetch(`http://127.0.0.1:${PORT}${p}`, init)).json();

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        const type = m.params.type;
        if (type === 'error' || type === 'warning' || /audio|音/i.test(text)) {
          this.logs.push(`${type}: ${text}`);
        }
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const detail = m.params.exceptionDetails || {};
        this.logs.push(`EXCEPTION: ${detail.text} ${detail.exception?.description || ''}`);
      }
      if (m.method === 'Log.entryAdded') {
        const text = m.params.entry.text || '';
        if (/audio|音/i.test(text)) this.logs.push(`${m.params.entry.level}: ${text}`);
      }
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result && res.result.value;
  }
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-replay-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    // 无头窗口没有用户手势，不加这个 AudioContext 会一直 suspended，探针就抓不到音
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  try {
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try { version = await fetchJson('/json/version'); break; } catch { await sleep(250); }
    }
    if (!version) throw new Error('Chrome 调试端口未就绪');

    const url = `${BASE}/#/pages/game/index?levelId=${LEVEL}`;
    const target = await fetchJson(`/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const cdp = new Cdp(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375, height: 812, deviceScaleFactor: 2, mobile: true
    });

    await cdp.send('Page.navigate', { url });
    // 3 秒倒计时 + 页面启动
    await sleep(3000);

    // 音频探针：拦 createOscillator，记录每个音「什么时候响、响多高」。
    // 必须在页面跑起来之后打补丁（addScriptToEvaluateOnNewDocument 在这里不生效，
    // 实测 window.__notes 一直是空的）；补在原型上，后续新建的振荡器都会经过。
    await cdp.eval(`(() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || window.__probed) return 'skip';
      window.__probed = true;
      window.__notes = [];
      const createOscillator = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function patched() {
        const context = this;
        const osc = createOscillator.call(context);
        const start = osc.start.bind(osc);
        osc.start = (when) => {
          const at = when === undefined ? context.currentTime : when;
          window.__notes.push({
            when: Math.round(at * 1000),
            freq: Math.round(osc.frequency.value)
          });
          return start(when);
        };
        return osc;
      };
      return 'ok';
    })()`);

    await sleep(2400);

    for (let value = 1; value <= TOTAL; value += 1) {
      const expression = `(() => {
        const leaves = Array.from(document.querySelectorAll('*')).filter(
          (n) => n.children.length === 0 && n.textContent.trim() === '${value}'
        );
        for (const leaf of leaves) {
          let el = leaf;
          while (el && !String(el.className || '').includes('cell')) el = el.parentElement;
          if (el && String(el.className || '').includes('cell')) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'ok';
          }
        }
        return 'miss';
      })()`;
      const hit = await cdp.eval(expression);
      if (hit !== 'ok') console.warn(`[replay] 没找到数字 ${value}`);
      await sleep(190);
    }

    // 等路由切到结算页
    let onResult = false;
    for (let i = 0; i < 60; i += 1) {
      const href = await cdp.eval('location.href');
      if (String(href).includes('/pages/result/index')) { onResult = true; break; }
      await sleep(100);
    }
    if (!onResult) throw new Error('没有跳到结算页');

    // 回放的音是**一次性按绝对时间排完**的（不是一个个定时器），所以不能在进页面后再清账 ——
    // 那样会把刚排好的整批抹掉。改成：清空 → 点一下盘面重播 → 只采这一轮。
    await cdp.eval('window.__notes = []');
    const replayHit = await cdp.eval(`(() => {
      const el = document.querySelector('[class*="boardWrap"]');
      if (!el) return 'miss';
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 'ok';
    })()`);
    if (replayHit !== 'ok') console.warn('[replay] 没找到回放盘面，无法重播采样');

    // 回放有 560ms 的起拍空档，等它真正开始
    await sleep(700);

    // 碎片出现的那一刻才算碎裂起点，别靠猜时间
    let started = false;
    for (let i = 0; i < 120; i += 1) {
      const hit = await cdp.eval('document.querySelectorAll(\'[class*="shard"]\').length');
      if (Number(hit) > 0) { started = true; break; }
      await sleep(40);
    }
    if (!started) throw new Error('没等到碎裂');

    let prev = 0;
    for (const at of FRAMES) {
      await sleep(at - prev);
      prev = at;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT, `replay-${String(at).padStart(4, '0')}ms.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.info(`[replay] 碎裂+${at}ms -> ${file}`);
    }

    // 声音体检：回放期间到底响了多少个音、间隔是不是按 delay 排的
    const raw = await cdp.eval('JSON.stringify(window.__notes || [])');
    const notes = JSON.parse(raw || '[]');
    const replayNotes = notes.filter((n) => n.freq > 0);
    if (replayNotes.length === 0) {
      const diag = await cdp.eval(`JSON.stringify({
        audioContext: typeof (window.AudioContext || window.webkitAudioContext),
        notes: (window.__notes || []).length,
        state: (() => { try { const c = new (window.AudioContext || window.webkitAudioContext)(); return c.state; } catch (e) { return 'ERR ' + e.message; } })()
      })`);
      console.warn('[replay] 没有捕获到任何音 —— 回放是静音的', diag);
      if (cdp.logs.length > 0) console.warn('[replay] 页面音频日志:\n' + cdp.logs.join('\n'));
    } else {
      // 一个音有多个分音（音色 parts），同一次 start 时刻的算一个音
      const onsets = [...new Set(replayNotes.map((n) => n.when))].sort((a, b) => a - b);
      const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
      const avg = Math.round(gaps.reduce((sum, g) => sum + g, 0) / Math.max(1, gaps.length));
      console.info(
        `[replay] 捕获 ${replayNotes.length} 个振荡器 / ${onsets.length} 个音，` +
          `平均间隔 ${avg}ms，跨度 ${onsets.length > 1 ? onsets[onsets.length - 1] - onsets[0] : 0}ms，` +
          `音高 ${Math.min(...replayNotes.map((n) => n.freq))}~${Math.max(...replayNotes.map((n) => n.freq))}Hz`
      );
      console.info(`[replay] 前 12 个间隔：${gaps.slice(0, 12).join(', ')}`);
    }
  } finally {
    chrome.kill();
    // 不等 WebSocket 自然回收，否则脚本会一直挂在这儿（被外层 timeout 杀掉时看不到输出）
    setTimeout(() => process.exit(0), 300).unref();
  }
};

run().catch((e) => { console.error('[replay] 失败', e); process.exit(1); });
