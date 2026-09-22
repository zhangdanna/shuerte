import React, { useEffect } from 'react';
import { useSaveStore } from '@/store/useSaveStore';
import { setSoundEnabled } from '@/services/audio';
import { setHapticsEnabled } from '@/services/haptics';
import { GameSettings } from '@/types/game';
// 全局样式
import './app.scss';

function App(props) {
  useEffect(() => {
    const applySettings = (settings: GameSettings) => {
      setSoundEnabled(settings.sound);
      setHapticsEnabled(settings.haptics);
    };
    applySettings(useSaveStore.getState().settings);
    // 设置项变更后同步到音效与震动服务
    return useSaveStore.subscribe((state) => applySettings(state.settings));
  }, []);

  return props.children;
}

export default App;
