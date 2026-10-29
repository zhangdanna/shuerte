/**
 * 移动视口截图 / 点击验证工具（仅开发期用）。
 *
 * Chrome 无头模式的窗口最小宽度是 500，直接 --window-size=375 会得到"500 布局裁到 375"的假图；
 * 这里用 CDP 的 Emulation.setDeviceMetricsOverride 覆盖成真正的 375×812 视口，
 * 顺便支持按数字点击格子，用来验证指引关这类需要交互的流程。
 *
 * 用法：
 *   node scripts/cdp-shot.js <url> <out.png> [选项]
 * 选项：
 *   --wait=1200        导航后等待毫秒数（默认 1500）
 *   --clicks=1,2,3     依次点击页面上文本等于这些数字的格子（每个点击间隔 260ms）
 *   --init=seed.js     首次加载后执行该文件里的 JS（例如写入预置存档），然后刷新再截图
 *   --eval="表达式"     在页面里求值并打印结果（验证动画/计算样式用；out 传 - 则只求值不截图）
 *   --full             截整页（默认只截一屏）
 *   --width=375 --height=812
 *
 * 前置：先跑一个静态服务（如 `python -m http.server 8899` 指向 dist/h5）。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error('用法: node scripts/cdp-shot.js <url> <out.png> [--wait=1500] [--clicks=1,2,3] [--full]');
  process.exit(1);
}

const opt = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const waitMs = Number(opt('wait', 1500));
const width = Number(opt('width', 375));
const height = Number(opt('height', 812));
const full = args.includes('--full');
const initFile = opt('init', '');
const evalExpr = opt('eval', '');
const clicks = opt('clicks', '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (pathname, init) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`, init);
  return res.json();
};

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

const run = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  try {
    // 等调试端口就绪
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        version = await fetchJson('/json/version');
        break;
      } catch (error) {
        await sleep(250);
      }
    }
    if (!version) {
      throw new Error('Chrome 调试端口没有就绪');
    }

    const target = await fetchJson(`/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const cdp = new Cdp(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true
    });
    await cdp.send('Page.navigate', { url });
    await sleep(waitMs);

    // 预置存档：先执行脚本，再刷新，让页面按新存档重新渲染
    if (initFile) {
      const source = fs.readFileSync(initFile, 'utf8');
      await cdp.send('Runtime.evaluate', { expression: source });
      await cdp.send('Page.reload');
      await sleep(waitMs);
    }

    // 求值：验证动画是否在跑、计算样式是否符合预期（out 传 - 时只求值不截图）
    if (evalExpr) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: evalExpr,
        returnByValue: true,
        awaitPromise: true
      });
      if (result.exceptionDetails) {
        console.warn('[cdp-shot] eval 抛错:', JSON.stringify(result.exceptionDetails.text));
      } else {
        console.info('[cdp-shot] eval:', JSON.stringify(result.result.value));
      }
    }

    if (out === '-') {
      return;
    }

    // 按数字点击格子：数字本身是 Text 节点（没有点击态），事件要冒泡到格子容器上；
    // 环心的目标数字也是同样的文本，所以必须往上找到带 cell 类名的祖先再派发
    for (const value of clicks) {
      const expression = `(() => {
        const leaves = Array.from(document.querySelectorAll('*')).filter(
          (node) => node.children.length === 0 && node.textContent.trim() === ${JSON.stringify(value)}
        );
        for (const leaf of leaves) {
          let el = leaf;
          while (el && !String(el.className || '').includes('cell')) {
            el = el.parentElement;
          }
          if (el && String(el.className || '').includes('cell')) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'ok';
          }
        }
        return 'miss';
      })()`;
      const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.result.value !== 'ok') {
        console.warn(`[cdp-shot] 没找到数字 ${value} 的格子`);
      }
      await sleep(260);
    }
    if (clicks.length > 0) {
      await sleep(600);
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: full
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.info(`[cdp-shot] 已保存 ${out}`);
  } finally {
    chrome.kill();
  }
};

run().catch((error) => {
  console.error('[cdp-shot] 失败', error);
  process.exit(1);
});
