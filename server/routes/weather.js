const express = require('express');
const router = express.Router();

const WEATHER_TIMEOUT_MS = 10000;

const fetchJsonWithTimeout = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AgriFraud-WeatherProxy/1.0',
    },
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Upstream weather request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Proxy weather forecast
router.get('/forecast', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600'); // Cache for 10 minutes
  
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=5`;
    
    const data = await fetchJsonWithTimeout(url);
    res.json(data);
  } catch (error) {
    console.error('Weather forecast error:', error.message, error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Proxy geocoding search
router.get('/search', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    
    const data = await fetchJsonWithTimeout(url);
    res.json(data);
  } catch (error) {
    console.error('Geocoding search error:', error.message, error);
    res.status(500).json({ error: 'Failed to search city' });
  }
});

// Proxy reverse geocoding for browser location lookup
router.get('/reverse', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');

  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=jsonv2&accept-language=en`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AgriFraud-WeatherProxy/1.0',
      },
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Upstream reverse geocoding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const address = data?.address || {};
    const name = address.city || address.town || address.village || address.county || address.state || data?.name || 'Current Location';

    return res.json({
      results: [
        {
          name,
          latitude: Number(latitude),
          longitude: Number(longitude),
        },
      ],
    });
  } catch (error) {
    console.error('Geocoding reverse error:', error.message, error);
    return res.status(500).json({ error: 'Failed to resolve coordinates' });
  }
});

module.exports = router;
