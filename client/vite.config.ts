import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Expose to all network interfaces
  },
  preview: {
    host: true, // Expose to all network interfaces
    port: 80,   // Run on port 80 for easy access
    allowedHosts: ['obsbot.local'],
  },
});
