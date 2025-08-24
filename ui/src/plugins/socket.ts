// src/plugins/socket.ts
import type { App } from 'vue';
import SocketService from '@/services/socket';

export default {
  install(app: App): void {
    app.config.globalProperties.$socket = SocketService;

    SocketService.init();
  },
};