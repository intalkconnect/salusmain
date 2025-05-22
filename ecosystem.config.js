module.exports = {
  apps: [
    {
      name: 'api',
      script: 'index.js',
      instances: '2',
      exec_mode: 'cluster',
    },
    {
      name: 'worker-upload-local',
      script: 'workers/uploadLocalWorker.js',
      instances: '3',
      exec_mode: 'fork',
    },
    {
      name: 'worker-process-job',
      script: 'workers/processJobWorker.js',
      instances: '4',
      exec_mode: 'fork',
    },
    {
      name: 'worker-upload-bucket',
      script: 'workers/uploadBucketWorker.js',
      instances: '1',
      exec_mode: 'fork',
    },
  ],
};
