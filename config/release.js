// release.js —— 一键发布：编译 + 上传（微信小程序）
// 用法：npm run release
// 等价于依次执行 npm run build:weapp → npm run upload，任一步失败即中止
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 1. 边界校验：上传密钥缺失直接失败，不做兜底
const keyPath = path.join(ROOT, 'private.wx.key');
if (!fs.existsSync(keyPath)) {
  console.error(`[release] 缺少代码上传密钥：${keyPath}`);
  console.error(
    '[release] 请在微信公众平台「开发管理 → 开发设置 → 小程序代码上传」生成并下载上传密钥，' +
      '放到项目根目录并命名为 private.wx.key'
  );
  process.exit(1);
}

// 2. 编译（产物写入 dist/weapp/）
console.info('[release] 开始编译到 dist/weapp ...');
const build = spawnSync('npm', ['run', 'build:weapp'], { cwd: ROOT, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error(`[release] 编译失败（exit ${build.status}），已中止上传`);
  process.exit(build.status ?? 1);
}

// 3. 上传（读取上一步的产物，生成一个「开发版本」）
console.info('[release] 编译完成，开始上传 ...');
const upload = spawnSync('node', ['config/upload.js'], { cwd: ROOT, stdio: 'inherit', shell: true });
if (upload.status !== 0) {
  console.error(`[release] 上传失败（exit ${upload.status}）`);
  process.exit(upload.status ?? 1);
}

console.info(
  '[release] 全部完成。下一步：微信公众平台「管理 → 版本管理」中，' +
    '把新版本「选为体验版」或「提交审核」'
);
