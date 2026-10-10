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
        OMP_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        NUMEXPR_NUM_THREADS: "1",
        VECLIB_MAXIMUM_THREADS: "1",
        OMP_WAIT_POLICY: "PASSIVE",
        KMP_BLOCKTIME: "0",
        MKL_DYNAMIC: "FALSE",
        FLAGS_use_mkldnn: "0",
        FLAGS_enable_mkldnn: "0",
        FLAGS_allocator_strategy: "auto_growth",
        FLAGS_eager_delete_tensor_gb: "0",
      },
    },
  ],
};
