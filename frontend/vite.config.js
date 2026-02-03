import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'k8s-default-appingre-5c306dac3d-400918894.us-east-1.elb.amazonaws.com',
    ],
  },
})
