// upload.js
const ci = require('miniprogram-ci');
const path = require('path');

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
    version: 'test1.0.0',
    desc: '测试版本',
    setting: {
      es6: true,
      es7: true,
      minify: true,
    },
    onProgressUpdate: console.log,
  });

  console.log('上传成功:', uploadResult);
})();