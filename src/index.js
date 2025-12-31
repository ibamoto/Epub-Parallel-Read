import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

// Suppress ResizeObserver loop warnings
const resizeObserverErrorHandler = (e) => {
  if (e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
      e.message === 'ResizeObserver loop limit exceeded') {
    e.stopImmediatePropagation()
  }
}
window.addEventListener('error', resizeObserverErrorHandler)

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
