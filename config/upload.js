// upload.js
const ci = require('miniprogram-ci');
const path = require('path');

// 每次上传前修改这两项
const VERSION = '2.0.0'; // 版本号，需在版本管理中与历史版本区分
const DESC = '古风乐谱纸画风全新改版；新增演奏音乐系统——原创曲库、演奏评级、曲集回放与黑胶唱片'; // 本次更新说明

(async () => {
  const project = new ci.Project({
    appid: 'wx25bf5262c669e9a9',
    type: 'miniProgram',
    projectPath: path.resolve(__dirname, '..', 'dist', 'weapp'),  // 指向 Taro 编译的微信小程序产物目录
    privateKeyPath: path.resolve(__dirname, '../private.wx.key'),  // 密钥文件路径
    ignores: ['node_modules/**/*'],
  });

  const uploadResult = await ci.upload({
    project,
    version: VERSION,
    desc: DESC,
    setting: {
      es6: true,
      es7: true,
      minify: true,
    },
    onProgressUpdate: console.log,
  });

  console.log('上传成功:', uploadResult);
})().catch((error) => {
  console.error('[upload] 上传失败:', error?.message || error);
  process.exit(1);
});