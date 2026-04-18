const express = require('express');

const router = express.Router();

const REVIEWER_IMAGE_SOURCES = {
  riya: 'https://randomuser.me/api/portraits/women/44.jpg',
  rajat: 'https://randomuser.me/api/portraits/men/32.jpg',
  saivarma: 'https://randomuser.me/api/portraits/men/68.jpg',
  sukram: 'https://randomuser.me/api/portraits/men/22.jpg',
  himanshu: 'https://randomuser.me/api/portraits/men/75.jpg',
};

const REVIEWER_LABELS = {
  riya: 'Riya',
  rajat: 'Rajat',
  saivarma: 'Sai',
  sukram: 'Sukram',
  himanshu: 'Himanshu',
};

function buildFallbackAvatar(label) {
  const safeLabel = String(label || 'User').trim() || 'User';
  const initial = safeLabel.charAt(0).toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="avatarBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7bc6a4" />
      <stop offset="100%" stop-color="#2f8f7f" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#avatarBg)" />
  <text x="50%" y="56%" text-anchor="middle" fill="#ffffff" font-size="56" font-family="Arial, sans-serif" font-weight="700">${initial}</text>
</svg>`.trim();

  return svg;
}

function sendFallbackAvatar(res, reviewerId) {
  const label = REVIEWER_LABELS[reviewerId] || reviewerId || 'User';
  const svg = buildFallbackAvatar(label);
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  return res.status(200).send(svg);
}

router.get('/:reviewerId', async (req, res) => {
  const reviewerId = String(req.params.reviewerId || '').toLowerCase();
  const sourceUrl = REVIEWER_IMAGE_SOURCES[reviewerId];

  if (!sourceUrl) {
    return sendFallbackAvatar(res, reviewerId);
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'AgriFraud-ReviewerImageProxy/1.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!upstream.ok) {
      return sendFallbackAvatar(res, reviewerId);
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = Buffer.from(await upstream.arrayBuffer());

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(imageBuffer);
  } catch (error) {
    console.error('Reviewer image proxy error:', error);
    return sendFallbackAvatar(res, reviewerId);
  }
});

module.exports = router;