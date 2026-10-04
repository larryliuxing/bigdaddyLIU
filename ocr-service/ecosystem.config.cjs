const path = require("path");

const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "guild-ocr",
      cwd: root,
      script: "ocr-service/start.sh",
      interpreter: "bash",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1500M",
      env: {
        GUILD_OCR_HOST: "127.0.0.1",
        GUILD_OCR_PORT: "8765",
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
      },
    },
  ],
};
