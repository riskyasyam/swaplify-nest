// JS Queue Service for NSQ → FastAPI Worker
const { Reader } = require('nsqjs');
const axios = require('axios');

const NSQ_TOPIC = 'facefusion_jobs';
const NSQ_CHANNEL = 'facefusion_worker';
const NSQ_HOST = '127.0.0.1';
const NSQ_PORT = '4150';
const NEST_API_URL = 'http://localhost:3000'; // Update if needed
const WORKER_URL = 'http://127.0.0.1:8081/worker/facefusion';
const WORKER_SECRET = process.env.WORKER_SHARED_SECRET || 'supersecret';

const reader = new Reader(NSQ_TOPIC, NSQ_CHANNEL, {
  nsqdTCPAddresses: `${NSQ_HOST}:${NSQ_PORT}`,
});

console.log('🚀 JS Queue Service started. Waiting for jobs from NSQ...');

reader.connect();

reader.on('message', async (msg) => {
  try {
    const job = JSON.parse(msg.body.toString());
    console.log('📨 Received job from NSQ:', job);

    // Get asset details from NestJS API
    console.log('🔄 Fetching asset details from NestJS...');
    const sourceAsset = await axios.get(`${NEST_API_URL}/media-assets/${job.sourceAssetId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || 'internalsecret' }
    });
    const targetAsset = await axios.get(`${NEST_API_URL}/media-assets/${job.targetAssetId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || 'internalsecret' }
    });

    // Send job to FastAPI worker
    const payload = {
      jobId: job.jobId,
      sourceKey: sourceAsset.data.objectKey,
      targetKey: targetAsset.data.objectKey,
      options: {
        processors: job.processors || [],
        faceSwapperModel: job.options?.faceSwapperModel || 'inswapper_128',
        useCuda: job.options?.useCuda || true,
        deviceId: parseInt(job.options?.deviceId) || 0,
        extraArgs: []
      }
    };

    console.log('🚀 Sending job to FastAPI worker:', payload);
    
    // Update status ke RUNNING saat mulai kirim ke worker
    await axios.post(`${NEST_API_URL}/jobs/${job.jobId}/internal-status`, {
      status: 'RUNNING',
      progressPct: 10,
    }, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || 'internalsecret' }
    });
    console.log('🔄 Job status updated to RUNNING');
    
    const response = await axios.post(WORKER_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
    });

    console.log('✅ FastAPI worker response:', response.data);

    // JANGAN update status di sini - biarkan FastAPI worker yang callback
    // FastAPI worker akan otomatis callback ke NestJS dengan status SUCCEEDED/FAILED
    
    console.log('✅ Job sent to worker, waiting for callback from FastAPI worker');
    msg.finish();
  } catch (err) {
    console.error('❌ Error processing job:', err.message);
    console.error('❌ Full error:', err);
    msg.requeue(30000); // Requeue after 30s
  }
});

reader.on('error', (err) => {
  console.error('NSQ Reader error:', err);
});
