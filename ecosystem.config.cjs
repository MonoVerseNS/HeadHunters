module.exports = {
  apps: [
    {
      name: 'hh-prod',
      script: 'server/server.js',
      args: '--mode=prod',
      env: {
        NODE_ENV: 'production',
        PORT: 3310
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'hh-test',
      script: 'server/server.js',
      args: '--mode=test',
      env: {
        NODE_ENV: 'production', // Still run as prod for performance, but mode=test for config
        PORT: 3311
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
}
