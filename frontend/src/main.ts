/**
 * deepwork CE App Shell — main entry point.
 *
 * Registers framework + module plugins. Each module (deepwork-terminal, etc.)
 * exports a Vue Plugin that adds its routes and components to this host app.
 *
 * @see deepwork-terminal/frontend/src/plugin.ts
 */
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import '@ce/assets/main.css'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/terminal'
    }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
