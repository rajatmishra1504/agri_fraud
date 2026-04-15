const express = require('express');
const router = express.Router();

// Proxy weather forecast
router.get('/forecast', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600'); // Cache for 10 minutes
  
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=5`;
    
    console.log('Fetching weather from:', url);
    const response = await fetch(url, { timeout: 10000 });
    
    if (!response.ok) {
      console.error('Weather API response not OK:', response.status, response.statusText);
      throw new Error(`Failed to fetch weather: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Weather forecast error:', error.message, error);
    res.status(500).json({ error: 'Failed to fetch weather data', details: error.message });
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
    
    console.log('Searching cities with:', query);
    const response = await fetch(url, { timeout: 10000 });
    
    if (!response.ok) {
      console.error('Geocoding API response not OK:', response.status, response.statusText);
      throw new Error(`Failed to search city: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Geocoding search error:', error.message, error);
    res.status(500).json({ error: 'Failed to search city', details: error.message });
  }
});

module.exports = router;
