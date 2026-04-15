const express = require('express');

const router = express.Router();

const REVIEWER_IMAGE_SOURCES = {
  riya: 'https://randomuser.me/api/portraits/women/44.jpg',
  rajat: 'https://randomuser.me/api/portraits/men/32.jpg',
  saivarma: 'https://randomuser.me/api/portraits/men/68.jpg',
  sukram: 'https://randomuser.me/api/portraits/men/22.jpg',
  himanshu: 'https://randomuser.me/api/portraits/men/75.jpg',
};

router.get('/:reviewerId', async (req, res) => {
  const reviewerId = String(req.params.reviewerId || '').toLowerCase();
  const sourceUrl = REVIEWER_IMAGE_SOURCES[reviewerId];

  if (!sourceUrl) {
    return res.status(404).json({ error: 'Reviewer image not found' });
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'AgriFraud-ReviewerImageProxy/1.0',
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Failed to fetch reviewer image' });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = Buffer.from(await upstream.arrayBuffer());

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(imageBuffer);
  } catch (error) {
    console.error('Reviewer image proxy error:', error);
    return res.status(500).json({ error: 'Unable to load reviewer image' });
  }
});

module.exports = router;