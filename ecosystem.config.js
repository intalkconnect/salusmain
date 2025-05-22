module.exports = {
  apps: [
    {
      name: 'api',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'worker-upload-local',
      script: 'workers/uploadLocalWorker.js',
      instances: 'max',
      exec_mode: 'cluster',
    },
    {
      name: 'worker-process-job',
      script: 'workers/processJobWorker.js',
      instances: 'max',
      exec_mode: 'cluster',
    },
    {
      name: 'worker-upload-bucket',
      script: 'workers/uploadBucketWorker.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
