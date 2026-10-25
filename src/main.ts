import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './locales'
import './styles/global.css'
import { registerServiceWorker } from './register-sw'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')

// 生产构建下启用离线能力（首次使用后断网仍可处理素材）
registerServiceWorker()
