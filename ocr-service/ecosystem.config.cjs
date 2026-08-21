module.exports = {
  apps: [
    {
      name: "guild-ocr",
      cwd: "/var/www/guild",
      script: "ocr-service/power_server.py",
      interpreter: "python3",
      instances: 1,
      autorestart: true,
      max_memory_restart: "800M",
      env: {
        GUILD_OCR_HOST: "127.0.0.1",
        GUILD_OCR_PORT: "8765",
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
      },
    },
  ],
};
