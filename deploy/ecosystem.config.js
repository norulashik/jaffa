module.exports = {
  apps: [
    {
      name: "jaffa-backend",
      cwd: "/home/ubuntu/jaffa/backend",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "jaffa-frontend",
      cwd: "/home/ubuntu/jaffa/frontend",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
