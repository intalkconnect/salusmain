module.exports = {
  apps: [
    {
      name: 'api',
      script: 'index.js',
      instances: 'max',
      exec_mode: 'cluster',
    },
    {
      name: 'worker',
      script: 'workers/worker.js',
      instances: '4',
      exec_mode: 'fork',
    },
  ],
};
