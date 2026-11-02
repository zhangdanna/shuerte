/**
 * H5 产物打包：清掉平台不收的文件类型，再把 dist/h5 压成一个 zip。
 *
 * 为什么需要：
 *   1. 发布平台只接受 jpg / css / gif / svg / png / js / jpeg / json / html / woff2 / webp / woff。
 *      webpack 默认会吐 `*.js.LICENSE.txt`（已在 config/index.ts 里关掉 extractComments），
 *      sourcemap、README 之类也可能混进来 —— 这里做最后一道兜底：非白名单文件直接删掉并逐条打印。
 *   2. 上传要一个 zip，且 **index.html 必须在压缩包根目录**（不能套一层 dist/h5）。
 *
 * 不引第三方库：用 zlib.deflateRaw 手写 ZIP（图片/字体等已压缩的走 store），
 * 免得为了一个打包脚本往 devDependencies 里加东西。
 *
 * 用法：
 *   node scripts/pack-h5.js                       # 打包 dist/h5 → dist/h5.zip
 *   node scripts/pack-h5.js --dir=dist/h5 --out=dist/h5.zip
 *   node scripts/pack-h5.js --keep                # 只报告，不删除非白名单文件（它们仍不会进 zip）
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/** 平台白名单（小写、不带点） */
const ALLOWED = new Set([
  'jpg',
  'css',
  'gif',
  'svg',
  'png',
  'js',
  'jpeg',
  'json',
  'html',
  'woff2',
  'webp',
  'woff',
]);

/** 本身已压缩的格式：再 deflate 只会白费 CPU，直接 store */
const STORED = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'woff', 'woff2']);

const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const rootDir = path.resolve(process.cwd(), arg('dir', 'dist/h5'));
const zipPath = path.resolve(process.cwd(), arg('out', 'dist/h5.zip'));
const keepDisallowed = process.argv.includes('--keep');

const log = (msg) => console.log(`[pack-h5] ${msg}`);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

/** 递归列出文件，路径统一成 / 分隔（zip 规范） */
const walk = (dir, base = dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.isFile()) {
      out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
    }
  }
  return out;
};

// ============ ZIP 写入（零依赖） ============
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
};

/** DOS 时间：秒只有 2 秒精度，1980 年起算 */
const dosTime = (date) =>
  ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff;
const dosDate = (date) =>
  (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

const buildZip = (files) => {
  const locals = [];
  const centrals = [];
  let offset = 0;

  files.forEach((file) => {
    const name = Buffer.from(file.rel, 'utf8');
    const raw = fs.readFileSync(file.full);
    const ext = path.extname(file.rel).slice(1).toLowerCase();
    const stat = fs.statSync(file.full);
    const time = dosTime(stat.mtime);
    const date = dosDate(stat.mtime);
    const crc = crc32(raw);

    let method = STORED.has(ext) ? 0 : 8;
    let body = method === 8 ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
    // 压完反而更大（小文件常见）就退回 store
    if (method === 8 && body.length >= raw.length) {
      method = 0;
      body = raw;
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 解压所需版本
    local.writeUInt16LE(0x0800, 6); // bit11：文件名为 UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra 长度

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    central.writeUInt16LE(20, 4); // 创建版本
    central.writeUInt16LE(20, 6); // 解压所需版本
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // 起始磁盘号
    central.writeUInt16LE(0, 36); // 内部属性
    central.writeUInt32LE(0, 38); // 外部属性
    central.writeUInt32LE(offset, 42); // 本地头偏移

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  });

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 目录结束签名
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
};

// ============ 主流程 ============
const main = () => {
  if (!fs.existsSync(rootDir)) {
    console.error(`[pack-h5] 找不到产物目录 ${rootDir}，先跑 npm run build:h5`);
    process.exit(1);
  }

  const all = walk(rootDir);
  if (!all.some((file) => file.rel === 'index.html')) {
    console.error(`[pack-h5] ${rootDir} 里没有 index.html，产物不完整`);
    process.exit(1);
  }

  const allowed = [];
  const rejected = [];
  all.forEach((file) => {
    const ext = path.extname(file.rel).slice(1).toLowerCase();
    if (ALLOWED.has(ext)) {
      allowed.push(file);
    } else {
      rejected.push(file);
    }
  });

  if (rejected.length > 0) {
    log(`发现 ${rejected.length} 个平台不收的文件（不在白名单内）：`);
    rejected.forEach((file) => {
      const size = fs.statSync(file.full).size;
      console.log(`  - ${file.rel} (${kb(size)})`);
      if (!keepDisallowed) fs.rmSync(file.full);
    });
    if (keepDisallowed) {
      log('--keep：保留在磁盘上，但不会进 zip');
    } else {
      log('已从产物目录删除');
    }
  }

  // 允许空目录残留，但顺手清掉已经空了的目录，免得上传时又是一堆空目录
  const pruneEmptyDirs = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory()) return;
      const full = path.join(dir, entry.name);
      pruneEmptyDirs(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    });
  };
  pruneEmptyDirs(rootDir);

  const files = allowed.filter((file) => file.full !== zipPath);
  const zip = buildZip(files);

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, zip);

  const rawSize = files.reduce((sum, file) => sum + fs.statSync(file.full).size, 0);
  log(`${files.length} 个文件 → ${path.relative(process.cwd(), zipPath)}`);
  log(`原始 ${kb(rawSize)}，压缩后 ${kb(zip.length)}`);
};

main();
