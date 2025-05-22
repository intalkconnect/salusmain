module.exports = {
  apps: [
    {
      name: 'api',
      script: 'index.js',
      instances: '1',
      exec_mode: 'cluster',
    },
    {
      name: 'worker',
      script: 'workers/worker.js',
      instances: 'max',
      exec_mode: 'cluster',
    },
  ],
};
