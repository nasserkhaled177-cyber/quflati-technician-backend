import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,        // المنفذ الثابت
    strictPort: true,  // مهم جداً - إذا مشغول يعطيك خطأ وما يغير المنفذ
    host: true
  }
})
