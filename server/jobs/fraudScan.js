const cron = require('node-cron');
const fraudEngine = require('../services/fraudDetection');

const schedule = process.env.FRAUD_SCAN_CRON || '0 2 * * *'; // Default: 2 AM daily

cron.schedule(schedule, async () => {
  console.log('⏰ Running scheduled fraud scan...');
  try {
    const results = await fraudEngine.scanAllBatches();
    console.log('✅ Scheduled fraud scan completed:', results);
  } catch (error) {
    console.error('❌ Scheduled fraud scan failed:', error);
  }
});

console.log(`📅 Fraud scan scheduled: ${schedule}`);

if (require.main === module) {
  fraudEngine.scanAllBatches().then(() => process.exit(0));
}
