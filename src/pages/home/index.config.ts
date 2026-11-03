export default definePageConfig({
  // 首页自绘大标题「眼力大作战」，系统导航栏不再重复一行「舒尔特方格」
  navigationBarTitleText: '',
  // 右上角菜单「转发给朋友 / 分享到朋友圈」的开关。
  // 不打开的话微信会把这两项置灰并提示「当前页面未设置分享」，与是否已上线无关。
  enableShareAppMessage: true,
  enableShareTimeline: true
});
