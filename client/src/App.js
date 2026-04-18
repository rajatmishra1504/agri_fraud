import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, CheckCircle, XCircle, ShieldAlert, Package, FileText, Truck, Home, LogOut, Bell, Search, ShoppingCart, ScanLine, CloudSun, Wind, Droplets, Newspaper, Sparkles, ChevronLeft, ChevronRight, ExternalLink, X, LocateFixed, RefreshCw, ThermometerSun, Sunrise, Sunset, Mail, Twitter, Instagram } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import 'bootstrap/dist/css/bootstrap.min.css';
import appLogo from './assets/app-logo.svg';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api');

const api = axios.create({
  baseURL: API_URL,
});

const FILE_BASE_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '')
  : (window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');

const getFileUrl = (filePath) => {
  if (!filePath) return '';
  if (/^https?:\/\//i.test(filePath)) return filePath;
  if (filePath.startsWith('/')) {
    return FILE_BASE_URL ? `${FILE_BASE_URL}${filePath}` : filePath;
  }
  return FILE_BASE_URL ? `${FILE_BASE_URL}/${filePath}` : `/${filePath}`;
};

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const normalizeUnit = (value) => String(value || '').trim().toLowerCase();

const formatQuantity = (value, unit) => {
  const numericValue = Number(value || 0);
  const safeUnit = String(unit || 'kg').trim();

  return `${Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'} ${safeUnit}`;
};

const FEATURED_WEATHER_CITIES = [
  { name: 'Delhi', latitude: 28.6139, longitude: 77.2090 },
  { name: 'Pune', latitude: 18.5204, longitude: 73.8567 },
  { name: 'Jaipur', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Lucknow', latitude: 26.8467, longitude: 80.9462 },
];

const getWeatherSummary = (weatherCode) => {
  const code = Number(weatherCode);
  if ([0, 1].includes(code)) return 'Clear';
  if ([2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Mixed';
};

const shortDayLabel = (dateValue) => {
  const dateObj = new Date(dateValue);
  if (Number.isNaN(dateObj.getTime())) return 'Day';
  return dateObj.toLocaleDateString(undefined, { weekday: 'short' });
};

const formatHourMinute = (dateValue) => {
  const dateObj = new Date(dateValue);
  if (Number.isNaN(dateObj.getTime())) return '--:--';
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatRating = (value) => {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00';
};

const createLocalAvatarDataUri = (name) => {
  const trimmedName = String(name || 'User').trim() || 'User';
  const firstChar = Array.from(trimmedName)[0] || 'U';
  const initial = firstChar.toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${trimmedName}">
  <defs>
    <linearGradient id="localAvatarBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8fd3b8" />
      <stop offset="100%" stop-color="#2f8f7f" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#localAvatarBg)" />
  <text x="50%" y="56%" text-anchor="middle" fill="#ffffff" font-size="54" font-family="Arial, sans-serif" font-weight="700">${initial}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderBadgeCount, setOrderBadgeCount] = useState(0);
  const autoScannedUserRef = useRef(null);

  useEffect(() => {
    const syncUserFromToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await api.get(`/auth/me?t=${Date.now()}`);
        setUser(res.data);
      } catch (error) {
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    const handleStorageChange = (event) => {
      if (event.key !== 'token') return;
      syncUserFromToken();
    };

    syncUserFromToken();
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setOrderBadgeCount(0);
    autoScannedUserRef.current = null;
  };

  useEffect(() => {
    if (!user) {
      setOrderBadgeCount(0);
      return;
    }

    if (!['buyer', 'fraud_analyst', 'admin'].includes(user.role)) {
      setOrderBadgeCount(0);
      return;
    }

    let isMounted = true;

    const fetchOrderBadgeCount = async () => {
      try {
        const endpoint = user.role === 'buyer' ? '/orders/my' : '/orders';
        const response = await api.get(endpoint);
        const orders = Array.isArray(response.data) ? response.data : [];

        let count = 0;
        if (user.role === 'buyer') {
          count = orders.filter((order) => ['REQUESTED', 'APPROVED'].includes(String(order.status || '').toUpperCase())).length;
        } else {
          count = orders.filter((order) => String(order.status || '').toUpperCase() === 'REQUESTED').length;
        }

        if (isMounted) {
          setOrderBadgeCount(count);
        }
      } catch (error) {
        if (isMounted) {
          setOrderBadgeCount(0);
        }
      }
    };

    fetchOrderBadgeCount();
    const intervalId = window.setInterval(fetchOrderBadgeCount, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'fraud_analyst') {
      autoScannedUserRef.current = null;
      return;
    }

    const userIdentity = user.id || user.email || user.name;
    if (!userIdentity || autoScannedUserRef.current === userIdentity) {
      return;
    }

    autoScannedUserRef.current = userIdentity;

    api.post('/fraud/scan').catch(() => {
      autoScannedUserRef.current = null;
    });
  }, [user]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        {user ? (
          <>
            <Navbar user={user} logout={logout} orderBadgeCount={orderBadgeCount} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={user.role === 'buyer' ? <BuyerDashboard user={user} /> : <Dashboard user={user} />} />
                <Route path="/batches" element={<BatchList user={user} />} />
                <Route path="/certificates" element={<CertificateList user={user} />} />
                <Route path="/shipments" element={<ShipmentsPage user={user} />} />
                <Route path="/orders" element={<OrdersPage user={user} />} />
                <Route path="/fraud" element={<FraudDashboard user={user} />} />
                <Route path="/cases" element={<CaseList user={user} />} />
                <Route path="/verify/:qrCode" element={<VerifyCertificate />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </>
        ) : (
          <Routes>
            <Route path="/verify/:qrCode" element={<VerifyCertificate />} />
            <Route path="*" element={<Login setUser={setUser} />} />
            <Route path="/shipments" element={<Navigate to="/" replace />} />

          </Routes>
        )}
      </div>
    </Router>
  );
}

function Navbar({ user, logout, orderBadgeCount = 0 }) {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <img src={appLogo} alt="AgriFraud Detector logo" className="nav-logo-image" />
        <span>AgriFraud Detector</span>
      </div>
      <div className="nav-links">
        <Link to="/"><Home size={18} /> Dashboard</Link>
        <Link to="/batches"><Package size={18} /> Batches</Link>
        <Link to="/certificates"><FileText size={18} /> Certificates</Link>
        <Link to="/shipments"><Truck size={18} /> Shipments</Link>
        {(user.role === 'buyer' || user.role === 'fraud_analyst' || user.role === 'admin') && (
          <Link to="/orders" className="orders-nav-link">
            <ShoppingCart size={18} />
            <span>Orders</span>
            {orderBadgeCount > 0 && <span className="orders-badge">{orderBadgeCount}</span>}
          </Link>
        )}
        {(user.role === 'fraud_analyst' || user.role === 'admin') && (
          <>
            <Link to="/fraud"><AlertTriangle size={18} /> Fraud Flags</Link>
            <Link to="/cases"><Search size={18} /> Cases</Link>
          </>
        )}
      </div>
      <div className="nav-user">
        <span>{user.name} ({user.role})</span>
        <button onClick={logout} className="btn-icon"><LogOut size={18} /></button>
      </div>
    </nav>
  );
}

function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [weatherCity, setWeatherCity] = useState(FEATURED_WEATHER_CITIES[0]);
  const [weatherSearch, setWeatherSearch] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherUnit, setWeatherUnit] = useState('C');
  const [weatherGeoLoading, setWeatherGeoLoading] = useState(false);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    region: '',
    role: 'buyer'
  });

  const blogLinks = [
    {
      title: 'Food fraud operations and enforcement (Europol)',
      source: 'Europol',
      url: 'https://www.europol.europa.eu/media-press/newsroom/news/operation-ophson-targeting-food-fraud',
      summary: 'Operational updates, regional crackdowns, and cross-border investigations into food fraud networks.',
      tags: ['Enforcement', 'Investigation', 'Global'],
    },
    {
      title: 'Illicit food and beverage crime overview',
      source: 'INTERPOL',
      url: 'https://www.interpol.int/en/Crimes/Illicit-goods/Illicit-food-and-beverages',
      summary: 'High-level overview of illicit food risks, market impacts, and international policing responses.',
      tags: ['Crime', 'Risk', 'Policy'],
    },
    {
      title: 'Food traceability requirements (FSMA 204)',
      source: 'U.S. FDA',
      url: 'https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods',
      summary: 'Official guidance on enhanced recordkeeping and traceability obligations for regulated foods.',
      tags: ['Compliance', 'Traceability', 'FDA'],
    },
  ];

  useEffect(() => {
    if (!selectedBlog) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedBlog(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedBlog]);

  const reviews = [
    {
      name: 'Riya 💫',
      role: 'Procurement Lead, GreenMart',
      quote: 'AgriFraud Detector helped us cut supplier verification time by more than half.',
      image: `${API_URL}/reviewer-images/riya`,
      rating: 5,
    },
    {
      name: 'Rajat',
      role: 'Quality Inspector, FarmLink',
      quote: 'Shipment timelines and certificate tracing are crystal clear for every batch.',
      image: `${API_URL}/reviewer-images/rajat`,
      rating: 5,
    },
    {
      name: 'Sai varma',
      role: 'Operations Head, AgroSync',
      quote: 'The fraud alerts are practical and actionable. Our analysts trust the dashboard daily.',
      image: `${API_URL}/reviewer-images/saivarma`,
      rating: 4,
    },
    {
      name: 'Sukram',
      role: 'Buyer, FreshCity Retail',
      quote: 'I can verify a certificate in seconds before placing a large purchase order.',
      image: `${API_URL}/reviewer-images/sukram`,
      rating: 5,
    },
    {
      name: 'Himanshu',
      role: 'Logistics Coordinator, AgroRoute',
      quote: 'The shipment history timeline reduced confusion across transporter handovers.',
      image: `${API_URL}/reviewer-images/himanshu`,
      rating: 4,
    },
  ];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveReviewIndex((prev) => (prev + 1) % reviews.length);
    }, 3200);

    return () => window.clearInterval(intervalId);
  }, [reviews.length]);

  const moveReview = (direction) => {
    setActiveReviewIndex((prev) => (prev + direction + reviews.length) % reviews.length);
  };

  const compactQuote = (quote) => {
    if (!quote) return '';
    return quote.length > 88 ? `${quote.slice(0, 85)}...` : quote;
  };

  const toDisplayTemp = useCallback((value) => {
    const numericValue = Number(value || 0);
    if (weatherUnit === 'F') {
      return Math.round((numericValue * 9) / 5 + 32);
    }
    return Math.round(numericValue);
  }, [weatherUnit]);

  const loadWeather = useCallback(async (city) => {
    if (!city?.latitude || !city?.longitude) return;

    setWeatherLoading(true);
    setWeatherError('');

    try {
      const response = await fetch(`${API_URL}/weather/forecast?latitude=${city.latitude}&longitude=${city.longitude}`);
      if (!response.ok) throw new Error('Failed weather response');

      const data = await response.json();
      const daily = Array.isArray(data?.daily?.time)
        ? data.daily.time.slice(0, 4).map((timeValue, index) => ({
            day: shortDayLabel(timeValue),
            max: Math.round(Number(data.daily.temperature_2m_max?.[index] ?? 0)),
            min: Math.round(Number(data.daily.temperature_2m_min?.[index] ?? 0)),
            rainChance: Math.round(Number(data.daily.precipitation_probability_max?.[index] ?? 0)),
            uvMax: Number(data.daily.uv_index_max?.[index] ?? 0).toFixed(1),
            sunrise: formatHourMinute(data.daily.sunrise?.[index]),
            sunset: formatHourMinute(data.daily.sunset?.[index]),
          }))
        : [];

      setWeatherData({
        cityName: city.name,
        summary: getWeatherSummary(data?.current?.weather_code),
        currentTemp: Math.round(Number(data?.current?.temperature_2m ?? 0)),
        feelsLike: Math.round(Number(data?.current?.apparent_temperature ?? 0)),
        humidity: Math.round(Number(data?.current?.relative_humidity_2m ?? 0)),
        windSpeed: Math.round(Number(data?.current?.wind_speed_10m ?? 0)),
        rainNow: Number(data?.current?.precipitation ?? 0).toFixed(1),
        isDay: Number(data?.current?.is_day ?? 1) === 1,
        daily,
      });
    } catch (weatherFetchError) {
      setWeatherError('Unable to load live weather now. Try another city.');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeather(weatherCity);
  }, [weatherCity, loadWeather]);

  const handleWeatherSearch = async (e) => {
    e.preventDefault();
    const query = weatherSearch.trim();
    if (!query) return;

    try {
      setWeatherError('');
      const geoRes = await fetch(`${API_URL}/weather/search?query=${encodeURIComponent(query)}`);
      if (!geoRes.ok) throw new Error('Failed city lookup');
      const geoData = await geoRes.json();
      const cityResult = geoData?.results?.[0];
      if (!cityResult) {
        setWeatherError('City not found. Try a different spelling.');
        return;
      }

      setWeatherCity({
        name: cityResult.name,
        latitude: cityResult.latitude,
        longitude: cityResult.longitude,
      });
      setWeatherSearch('');
    } catch (geoError) {
      setWeatherError('Could not search city now. Please try again.');
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setWeatherError('Geolocation is not supported on this browser.');
      return;
    }

    setWeatherGeoLoading(true);
    setWeatherError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          const reverseRes = await fetch(`${API_URL}/weather/reverse?latitude=${latitude}&longitude=${longitude}`);
          const reverseData = reverseRes.ok ? await reverseRes.json() : null;
          const cityResult = reverseData?.results?.[0];

          setWeatherCity({
            name: cityResult?.name || 'Current Location',
            latitude,
            longitude,
          });
        } catch (locationError) {
          setWeatherError('Could not resolve your location weather.');
        } finally {
          setWeatherGeoLoading(false);
        }
      },
      () => {
        setWeatherGeoLoading(false);
        setWeatherError('Location access denied. Please allow location permission.');
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? { email, password, ...formData } : { email, password };
      
      const response = await api.post(endpoint, payload);
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
    } catch (err) {
      const apiError = err.response?.data;
      if (apiError?.error) {
        setError(apiError.error);
      } else if (apiError?.message) {
        setError(apiError.message);
      } else if (Array.isArray(apiError?.errors) && apiError.errors.length > 0) {
        setError(apiError.errors[0].msg || 'Validation failed');
      } else {
        setError('Authentication failed');
      }
    }
  };

  return (
    <div className="login-container">
      <div className="landing-shell">
        <section className="landing-unified">
          <header className="landing-masthead">
            <div className="landing-title-wrap">
              <img src={appLogo} alt="AgriFraud Detector logo" className="landing-logo-image" />
              <h1 className="landing-title">AgriFraud Detector</h1>
            </div>
            <p className="landing-motto">Trusted traceability, fraud intelligence, and confident transactions for modern agriculture supply chains.</p>
            <div className="landing-chip-row">
              <span className="badge text-bg-light border">AI-Powered Screening</span>
              <span className="badge text-bg-light border">Certificate-First Trust</span>
              <span className="badge text-bg-light border">Buyer-Safe Transactions</span>
            </div>
          </header>

          <div className="landing-grid">
            <aside className="landing-panel landing-panel-left">
              <div className="panel-header">
                <h3>Community Voices</h3>
                <span className="live-pill">Always updating</span>
              </div>

              <div className="reviews-slider" aria-label="Sliding customer reviews">
                <div
                  className="reviews-track"
                  style={{ transform: `translateX(-${activeReviewIndex * 100}%)` }}
                >
                  {reviews.map((review, idx) => (
                    <article key={`${review.name}-${idx}`} className="review-item review-slide p-3">
                      <div className="d-flex gap-3 align-items-start">
                        <img 
                          src={review.image} 
                          alt={`${review.name} review`} 
                          className="review-avatar"
                          onError={(event) => {
                            if (event.currentTarget.dataset.fallbackApplied === 'true') return;
                            event.currentTarget.dataset.fallbackApplied = 'true';
                            event.currentTarget.src = createLocalAvatarDataUri(review.name);
                          }}
                        />
                        <div>
                          <h6 className="mb-1">{review.name}</h6>
                          <p className="review-role mb-2">{review.role}</p>
                          <p className="mb-2 review-quote">{compactQuote(review.quote)}</p>
                          <div className="review-stars" aria-label={`${review.rating} star rating`}>
                            {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="reviews-controls">
                <button
                  type="button"
                  className="reviews-nav-btn"
                  aria-label="Previous review"
                  onClick={() => moveReview(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="reviews-dots">
                  {reviews.map((review, idx) => (
                    <button
                      key={`${review.name}-dot-${idx}`}
                      type="button"
                      className={`review-dot ${idx === activeReviewIndex ? 'active' : ''}`}
                      aria-label={`Show review ${idx + 1}`}
                      onClick={() => setActiveReviewIndex(idx)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="reviews-nav-btn"
                  aria-label="Next review"
                  onClick={() => moveReview(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <p className="reviews-footnote">Trusted feedback from buyers, inspectors, and analysts.</p>

              <article className="insight-block insight-left-block mt-3">
                <h6><Sparkles size={16} /> Why This Platform Exists</h6>
                <p>
                  AgriFraud Detector keeps buyers, inspectors, and analysts on one trusted timeline.
                  It gives clear visibility into certificates, shipments, and risk alerts.
                  This helps teams make faster and safer decisions with better traceability.
                </p>
              </article>
            </aside>

            <main className="landing-panel landing-panel-center">
              <div className="center-trust-note">
                One secure workspace for certificates, shipments, fraud intelligence, and buyer requests.
              </div>

              <div className="login-box">
                <div className="login-header">
                  <h2>{isRegister ? 'Create your account' : 'Sign in to continue'}</h2>
                  <p>{isRegister ? 'Join the trusted AgriFraud network' : 'Access your supply chain command center'}</p>
                </div>
                <form onSubmit={handleSubmit} className="login-form">
                  {isRegister && (
                    <>
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Region / Service Area"
                        value={formData.region || ''}
                        onChange={(e) => setFormData({...formData, region: e.target.value})}
                        required={['inspector', 'transporter', 'fraud_analyst'].includes(formData.role)}
                      />
                      <input
                        type="text"
                        placeholder="Organization"
                        value={formData.organization}
                        onChange={(e) => setFormData({...formData, organization: e.target.value})}
                      />
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({...formData, role: e.target.value})}
                        required
                      >
                        <option value="buyer">Buyer</option>
                        <option value="inspector">Inspector</option>
                        <option value="transporter">Transporter</option>
                        <option value="fraud_analyst">Fraud Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    </>
                  )}
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    title="Password must be at least 6 characters"
                    required
                  />
                  {error && <div className="error-msg">{error}</div>}
                  <button type="submit" className="btn-primary">
                    {isRegister ? 'Register' : 'Login'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRegister(!isRegister)}
                    className="btn-secondary"
                  >
                    {isRegister ? 'Already have an account?' : 'Create new account'}
                  </button>
                </form>
              </div>
            </main>

            <aside className="landing-panel landing-panel-right">
              <div className="panel-header panel-header-right">
                <Newspaper size={18} />
                <h3>Weather Insight</h3>
              </div>

              <article className="insight-block mb-3">
                <h6><CloudSun size={16} /> Live Weather Explorer</h6>
                <p>Real-time forecast with city search and quick explore options.</p>

                <div className="weather-actions-row">
                  <div className="weather-unit-toggle" role="group" aria-label="Temperature unit">
                    <button
                      type="button"
                      className={weatherUnit === 'C' ? 'active' : ''}
                      onClick={() => setWeatherUnit('C')}
                    >
                      C
                    </button>
                    <button
                      type="button"
                      className={weatherUnit === 'F' ? 'active' : ''}
                      onClick={() => setWeatherUnit('F')}
                    >
                      F
                    </button>
                  </div>

                  <button
                    type="button"
                    className="weather-action-btn"
                    onClick={() => loadWeather(weatherCity)}
                    disabled={weatherLoading}
                  >
                    <RefreshCw size={14} /> Refresh
                  </button>

                  <button
                    type="button"
                    className="weather-action-btn"
                    onClick={handleUseCurrentLocation}
                    disabled={weatherGeoLoading}
                  >
                    <LocateFixed size={14} /> {weatherGeoLoading ? 'Locating...' : 'Use My Location'}
                  </button>
                </div>

                <form className="weather-search-row" onSubmit={handleWeatherSearch}>
                  <input
                    type="text"
                    value={weatherSearch}
                    onChange={(e) => setWeatherSearch(e.target.value)}
                    placeholder="Search city"
                    aria-label="Search city weather"
                  />
                  <button type="submit" className="btn btn-sm btn-outline-primary">Explore</button>
                </form>

                <div className="weather-city-options">
                  {FEATURED_WEATHER_CITIES.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      className={`weather-city-chip ${weatherCity.name === city.name ? 'active' : ''}`}
                      onClick={() => setWeatherCity(city)}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>

                {weatherLoading && <p className="weather-status">Loading latest weather...</p>}
                {weatherError && <p className="weather-error">{weatherError}</p>}

                {weatherData && !weatherLoading && (
                  <>
                    <div className="weather-current">
                      <strong>{weatherData.cityName}</strong>
                      <span>{weatherData.summary}</span>
                    </div>

                    <div className="weather-chip-grid">
                      <span><CloudSun size={14} /> Temp: {toDisplayTemp(weatherData.currentTemp)}{weatherUnit}</span>
                      <span><ThermometerSun size={14} /> Feels like: {toDisplayTemp(weatherData.feelsLike)}{weatherUnit}</span>
                      <span><Droplets size={14} /> Humidity: {weatherData.humidity}%</span>
                      <span><Wind size={14} /> Wind: {weatherData.windSpeed} km/h</span>
                      <span><Sunrise size={14} /> Sunrise: {weatherData.daily[0]?.sunrise || '--:--'}</span>
                      <span><Sunset size={14} /> Sunset: {weatherData.daily[0]?.sunset || '--:--'}</span>
                    </div>

                    <div className="weather-forecast-list">
                      {weatherData.daily.map((day) => (
                        <div key={`${weatherData.cityName}-${day.day}`} className="weather-day-row">
                          <span>{day.day}</span>
                          <span>{toDisplayTemp(day.min)}{weatherUnit} / {toDisplayTemp(day.max)}{weatherUnit}</span>
                          <span>Rain {day.rainChance}% • UV {day.uvMax}</span>
                        </div>
                      ))}
                    </div>

                    <a
                      className="weather-explore-link"
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${weatherData.cityName} 7 day weather forecast`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explore full 7-day forecast
                    </a>
                  </>
                )}
              </article>

            </aside>
          </div>

          <section className="blog-full-width-wrap">
            <article className="insight-block learning-blogs-compact blog-full-width-card">
              <h6><Newspaper size={16} /> Recommended Reads</h6>
              <p>Open quick previews, then continue to the full source article.</p>
              <div className="blog-inline-list blog-inline-list-wide">
                {blogLinks.map((blog) => (
                  <button
                    key={blog.url}
                    type="button"
                    className="blog-inline-link blog-inline-button"
                    onClick={() => setSelectedBlog(blog)}
                  >
                    <span>{blog.title}</span>
                    <small>{blog.source} • Preview</small>
                  </button>
                ))}
              </div>
            </article>
          </section>

          {selectedBlog && (
            <div className="blog-preview-overlay" role="presentation" onClick={() => setSelectedBlog(null)}>
              <article className="blog-preview-modal" role="dialog" aria-modal="true" aria-label="Blog preview" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="blog-preview-close"
                  aria-label="Close blog preview"
                  onClick={() => setSelectedBlog(null)}
                >
                  <X size={16} />
                </button>

                <p className="blog-preview-source">{selectedBlog.source}</p>
                <h4>{selectedBlog.title}</h4>
                <p>{selectedBlog.summary}</p>

                <div className="blog-preview-tags">
                  {selectedBlog.tags.map((tag) => (
                    <span key={`${selectedBlog.url}-${tag}`}>{tag}</span>
                  ))}
                </div>

                <div className="blog-preview-actions">
                  <a href={selectedBlog.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} /> Open Full Article
                  </a>
                </div>
              </article>
            </div>
          )}

          <footer className="landing-footer">
            <div className="landing-footer-inner">
              <div className="footer-contact-wrap">
                <p className="mb-0">Contact us: support@agrifrauddetector.com</p>
                <span className="footer-connect-label">Connect with us</span>
              </div>
              <div className="footer-social-links" aria-label="Social links">
                <a href="mailto:support@agrifrauddetector.com" className="social-link social-email" aria-label="Email">
                  <Mail size={18} />
                </a>
                <a href="https://twitter.com/AgriFraudDetector" target="_blank" rel="noreferrer" className="social-link social-twitter" aria-label="Twitter">
                  <Twitter size={18} />
                </a>
                <a href="https://instagram.com/AgriFraudDetector" target="_blank" rel="noreferrer" className="social-link social-instagram" aria-label="Instagram">
                  <Instagram size={18} />
                </a>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function BuyerDashboard({ user }) {
  const [products, setProducts] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [transportersLoading, setTransportersLoading] = useState(false);
  const [transportersError, setTransportersError] = useState('');
  const [transporterRegionFilter, setTransporterRegionFilter] = useState(user?.region || '');
  const [deliveryDetailsByBatch, setDeliveryDetailsByBatch] = useState({});
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [activeBuyFormBatchId, setActiveBuyFormBatchId] = useState(null);
  const [visibleShipmentHistoryByBatch, setVisibleShipmentHistoryByBatch] = useState({});
  const [showGlobalShipmentHistory, setShowGlobalShipmentHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [orderingBatchId, setOrderingBatchId] = useState(null);
  const [ratingShipmentId, setRatingShipmentId] = useState(null);

  const getDefaultDeliveryDetails = useCallback((product) => ({
    delivery_location: '',
    preferred_delivery_date: '',
    delivery_contact_name: '',
    delivery_contact_phone: '',
    delivery_instructions: '',
    preferred_transporter_id: '',
    preferred_transporter_name: '',
    requested_quantity: String(product?.available_quantity_kg ?? ''),
    requested_unit: product?.batch_unit || 'kg'
  }), []);

  const loadTransporters = useCallback(async (region) => {
    setTransportersLoading(true);
    setTransportersError('');

    try {
      const response = await api.get('/transporters/marketplace', {
        params: region ? { region } : {}
      });

      setTransporters(Array.isArray(response.data.transporters) ? response.data.transporters : []);
    } catch (error) {
      setTransporters([]);
      setTransportersError('Transporter marketplace is unavailable right now.');
    } finally {
      setTransportersLoading(false);
    }
  }, []);

  const getMergedDeliveryDetails = useCallback((product) => {
    const existing = deliveryDetailsByBatch[product.batch_id] || {};
    return {
      ...getDefaultDeliveryDetails(product),
      ...existing
    };
  }, [deliveryDetailsByBatch, getDefaultDeliveryDetails]);

  const mapProductsFromData = (certificatesRes, batchesRes) => {
    const batchesById = new Map(batchesRes.data.batches.map(batch => [batch.id, batch]));
    const seenBatchIds = new Set();
    const mappedProducts = [];

    for (const cert of certificatesRes.data.certificates) {
      if (seenBatchIds.has(cert.batch_id)) continue;

      const batch = batchesById.get(cert.batch_id);
      if (!batch) continue;

      const totalQuantity = Number(batch.quantity_kg || 0);
      const availableQuantity = Number(batch.available_quantity_kg ?? totalQuantity);
      const batchUnit = normalizeUnit(batch.batch_unit) || 'kg';

      seenBatchIds.add(cert.batch_id);
      mappedProducts.push({
        id: cert.id,
        batch_id: cert.batch_id,
        batch_number: cert.batch_number,
        product_type: cert.product_type,
        farm_name: cert.farm_name,
        quantity_kg: totalQuantity,
        available_quantity_kg: availableQuantity,
        batch_unit: batchUnit,
        quality_grade: batch.quality_grade,
        inspector_name: cert.inspector_name,
        cert_number: cert.cert_number,
        qr_code: cert.qr_code,
        is_cert_valid: cert.is_valid,
        issued_at: cert.issued_at,
        description: `${cert.product_type} from ${cert.farm_name}, inspected and certified for traceability.`
      });
    }

    return mappedProducts;
  };

  const prepareBuyForm = (product) => {
    const existingDetails = getMergedDeliveryDetails(product);
    setDeliveryDetailsByBatch((prev) => ({
      ...prev,
      [product.batch_id]: {
        ...existingDetails,
        requested_quantity: existingDetails.requested_quantity || String(product.available_quantity_kg),
        requested_unit: product.batch_unit || 'kg'
      }
    }));
    setActiveBuyFormBatchId(product.batch_id);
    setShowBuyModal(true);
  };

  const chooseTransporterForBatch = (batchId, transporter) => {
    setDeliveryDetailsByBatch((prev) => ({
      ...prev,
      [batchId]: {
        ...(prev[batchId] || {}),
        preferred_transporter_id: transporter?.id || '',
        preferred_transporter_name: transporter?.name || ''
      }
    }));
  };

  useEffect(() => {
    Promise.all([
      api.get('/certificates?limit=40'),
      api.get('/batches?limit=40'),
      api.get('/shipments'),
      api.get('/orders/my')
    ])
      .then(([certificatesRes, batchesRes, shipmentsRes, ordersRes]) => {
        setProducts(mapProductsFromData(certificatesRes, batchesRes));
        setShipments(shipmentsRes.data.shipments || []);
        setOrders(ordersRes.data.orders || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTransporters(transporterRegionFilter.trim());
  }, [loadTransporters, transporterRegionFilter]);

  const extractQrCode = (inputValue) => {
    const trimmed = inputValue.trim();
    if (!trimmed) return '';

    if (trimmed.includes('/verify/')) {
      return trimmed.split('/verify/').pop().split(/[?#]/)[0];
    }

    return trimmed;
  };

  const handleVerify = async (value) => {
    const code = extractQrCode(value);
    if (!code) return;

    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await axios.get(`${API_URL}/verify/${code}`);
      setVerifyResult(res.data);
      setQrInput(code);
    } catch (err) {
      setVerifyResult({
        valid: false,
        message: err.response?.data?.message || 'Verification failed'
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleBuy = async (product) => {
    const deliveryDetails = getMergedDeliveryDetails(product);
    const requestedQuantity = Number(deliveryDetails.requested_quantity);
    const requestedUnit = normalizeUnit(deliveryDetails.requested_unit || product.batch_unit);
    const batchUnit = normalizeUnit(product.batch_unit);
    const availableQuantity = Number(product.available_quantity_kg);

    if (!String(deliveryDetails.delivery_location || '').trim()) {
      alert('Please enter a delivery location before placing the request.');
      return;
    }
    if (!deliveryDetails.preferred_delivery_date) {
      alert('Please select a preferred delivery date before placing the request.');
      return;
    }
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      alert('Please enter a quantity greater than zero.');
      return;
    }
    if (requestedQuantity > availableQuantity) {
      alert(`Only ${formatQuantity(availableQuantity, batchUnit)} is currently available for this batch.`);
      return;
    }
    if (requestedUnit !== batchUnit) {
      alert(`Unit must match the batch unit (${batchUnit}).`);
      return;
    }

    setOrderingBatchId(product.batch_id);

    try {
      await api.post('/orders', {
        batch_id: product.batch_id,
        requested_quantity_kg: requestedQuantity,
        requested_unit: product.batch_unit,
        delivery_location: String(deliveryDetails.delivery_location || '').trim(),
        preferred_delivery_date: deliveryDetails.preferred_delivery_date,
        delivery_contact_name: deliveryDetails.delivery_contact_name?.trim() || null,
        delivery_contact_phone: deliveryDetails.delivery_contact_phone?.trim() || null,
        delivery_instructions: deliveryDetails.delivery_instructions?.trim() || null,
        preferred_transporter_id: deliveryDetails.preferred_transporter_id || null,
        notes: `Buyer request for ${requestedQuantity} ${product.batch_unit} of ${product.product_type} (${product.batch_number})`
      });

      const refreshedOrders = await api.get('/orders/my');
      setOrders(refreshedOrders.data.orders || []);
      const [certificatesRes, batchesRes] = await Promise.all([
        api.get('/certificates?limit=40'),
        api.get('/batches?limit=40')
      ]);
      setProducts(mapProductsFromData(certificatesRes, batchesRes));
      setDeliveryDetailsByBatch((prev) => ({
        ...prev,
        [product.batch_id]: {
          ...getDefaultDeliveryDetails(product),
          requested_quantity: String(product.available_quantity_kg),
          requested_unit: product.batch_unit
        }
      }));
      setShowBuyModal(false);
      setActiveBuyFormBatchId(null);
      alert(`Purchase request created for ${product.product_type} (${product.batch_number})`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create purchase request');
    } finally {
      setOrderingBatchId(null);
    }
  };

  const rateTransporter = async (shipment) => {
    const rating = window.prompt(`Rate transporter ${shipment.transporter_name || ''} from 1-5`, '5');
    if (!rating) return;

    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      alert('Please enter a rating from 1 to 5.');
      return;
    }

    const reviewText = window.prompt('Optional feedback for the transporter:', '') || '';

    setRatingShipmentId(shipment.id);
    try {
      await api.post(`/transporters/${shipment.transporter_id}/rate`, {
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        rating: normalizedRating,
        review_text: reviewText.trim() || null
      });
      alert('Transporter rated successfully.');
      const refreshedShipments = await api.get('/shipments');
      setShipments(refreshedShipments.data.shipments || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rate transporter');
    } finally {
      setRatingShipmentId(null);
    }
  };

  if (loading) return <div className="loading">Loading buyer dashboard...</div>;

  return (
    <div className="dashboard buyer-dashboard">
      <h1>Buyer Dashboard</h1>

      <div className="card buyer-verify-card">
        <h2><ScanLine size={20} /> Verify Product QR</h2>
        <p>Paste QR code value or complete verification URL to check certificate validity and batch trace.</p>
        <div className="buyer-verify-actions">
          <input
            type="text"
            placeholder="Paste QR code or /verify/... link"
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={verifying || !qrInput.trim()}
            onClick={() => handleVerify(qrInput)}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {verifyResult && (
          <div className={`buyer-verify-result ${verifyResult.valid ? 'valid' : 'invalid'}`}>
            <div className="buyer-verify-header">
              {verifyResult.valid ? <CheckCircle size={22} /> : <XCircle size={22} />}
              <strong>{verifyResult.valid ? 'Valid certificate' : 'Invalid certificate'}</strong>
            </div>

            {verifyResult.certificate ? (
              <div className="buyer-trace-grid">
                <div><span>Batch</span><strong>{verifyResult.certificate.batch_number}</strong></div>
                <div><span>Product</span><strong>{verifyResult.certificate.product_type}</strong></div>
                <div><span>Farm</span><strong>{verifyResult.certificate.farm_name}</strong></div>
                <div><span>Farm Location</span><strong>{verifyResult.certificate.farm_location}</strong></div>
                <div><span>Inspector</span><strong>{verifyResult.certificate.inspector_name}</strong></div>
                <div><span>Issued On</span><strong>{new Date(verifyResult.certificate.issued_at).toLocaleDateString()}</strong></div>
              </div>
            ) : (
              <p>{verifyResult.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="card transporter-marketplace-card">
        <div className="marketplace-header">
          <div>
            <h2><Truck size={20} /> Transporter Marketplace</h2>
            <p>Choose a transporter by region, reliability, and completed delivery history.</p>
          </div>
          <div className="marketplace-filter-row">
            <label htmlFor="transporterRegionFilter">Region</label>
            <input
              id="transporterRegionFilter"
              type="text"
              value={transporterRegionFilter}
              onChange={(e) => setTransporterRegionFilter(e.target.value)}
              placeholder="e.g. Delhi, North Zone"
            />
          </div>
        </div>

        {transportersError && <div className="error-msg">{transportersError}</div>}
        {transportersLoading ? (
          <p className="buyer-empty">Loading transporter marketplace...</p>
        ) : transporters.length === 0 ? (
          <p className="buyer-empty">No transporters found for this region. Try a broader search.</p>
        ) : (
          <div className="transporter-market-grid">
            {transporters.slice(0, 6).map((transporter) => (
              <article key={transporter.id} className="transporter-card">
                <div className="transporter-card-top">
                  <div>
                    <h3>{transporter.name}</h3>
                    <p>{transporter.region || 'Unassigned region'}</p>
                  </div>
                  <span className="badge badge-blue">{formatRating(transporter.rating)} ★</span>
                </div>

                <div className="transporter-metrics">
                  <div><span>Reviews</span><strong>{transporter.rating_count || 0}</strong></div>
                  <div><span>Delivered</span><strong>{transporter.completed_shipments || 0}</strong></div>
                  <div><span>Active</span><strong>{transporter.active_shipments || 0}</strong></div>
                  <div><span>Coverage</span><strong>{transporter.region || 'Global'}</strong></div>
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (activeBuyFormBatchId) {
                      chooseTransporterForBatch(activeBuyFormBatchId, transporter);
                      return;
                    }

                    alert('Open a product order first, then choose a transporter inside the order form.');
                  }}
                >
                  Use for current order
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="buyer-products-grid">
        {products.map((product) => {
          const activeOrders = orders.filter(
            order => order.batch_id === product.batch_id && ['REQUESTED', 'APPROVED'].includes(order.status)
          );
          const latestOrder = orders.find(order => order.batch_id === product.batch_id);
          const available = product.is_cert_valid && Number(product.available_quantity_kg) > 0;
          const buyDisabled = !available || orderingBatchId === product.batch_id;
          const productShipments = shipments.filter(shipment => shipment.batch_id === product.batch_id);

          return (
            <div key={product.id} className="card buyer-product-card">
              <div className="buyer-product-top">
                <div>
                  <h3>{product.product_type}</h3>
                  <p className="buyer-product-subtitle">{product.batch_number}</p>
                </div>
                <span className={`badge ${available ? 'badge-green' : 'badge-gray'}`}>
                  {available ? 'Available' : 'Unavailable'}
                </span>
              </div>

              <p className="buyer-product-description">{product.description}</p>

              <div className="buyer-product-qr">
                <a
                  href={`/verify/${product.qr_code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="qr-link"
                  title={`Open verification link: ${window.location.origin}/verify/${product.qr_code}`}
                >
                  <QRCodeSVG
                    value={`${window.location.origin}/verify/${product.qr_code}`}
                    size={120}
                    level="M"
                    includeMargin
                  />
                </a>
                <p>Scan to verify authenticity</p>
                <a
                  href={`/verify/${product.qr_code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="qr-hover-link"
                >
                  {window.location.origin}/verify/{product.qr_code}
                </a>
              </div>

              <div className="buyer-product-meta">
                <div><span>Farm</span><strong>{product.farm_name}</strong></div>
                <div><span>Total Quantity</span><strong>{formatQuantity(product.quantity_kg, product.batch_unit)}</strong></div>
                <div><span>Available Now</span><strong>{formatQuantity(product.available_quantity_kg, product.batch_unit)}</strong></div>
                <div><span>Grade</span><strong>{product.quality_grade}</strong></div>
                <div><span>Inspector</span><strong>{product.inspector_name}</strong></div>
              </div>

              <div className="buyer-product-actions">
                <button type="button" className="btn-secondary" onClick={() => handleVerify(product.qr_code)}>
                  Verify QR
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setVisibleShipmentHistoryByBatch((prev) => ({
                    ...prev,
                    [product.batch_id]: !prev[product.batch_id]
                  }))}
                >
                  {visibleShipmentHistoryByBatch[product.batch_id]
                    ? `Hide My Shipment History (${productShipments.length})`
                    : `View My Shipment History (${productShipments.length})`}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={buyDisabled}
                  onClick={() => {
                    prepareBuyForm(product);
                  }}
                >
                  <ShoppingCart size={16} />
                  Buy Product
                </button>
              </div>

              {visibleShipmentHistoryByBatch[product.batch_id] && (
                <div className="buyer-product-shipments" style={{ marginTop: '1rem' }}>
                  <h4>My Shipment History ({productShipments.length})</h4>
                  {productShipments.length === 0 ? (
                    <p className="buyer-empty">No shipments yet for this product batch.</p>
                  ) : (
                    <div className="buyer-product-shipment-list">
                      {productShipments.slice(0, 3).map((shipment) => (
                        <div key={shipment.id} className="buyer-product-shipment-item">
                          <div>
                            <strong>{shipment.shipment_number}</strong>
                            <div className="buyer-mini-text">{shipment.from_location} to {shipment.to_location}</div>
                          </div>
                          <div className="buyer-product-shipment-right">
                            <span className={`badge ${shipment.status === 'DELIVERED' ? 'badge-green' : 'badge-blue'}`}>
                              {shipment.status}
                            </span>
                            <div className="buyer-mini-text">
                              {shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleDateString() : 'In transit'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {productShipments.length > 3 && (
                        <p className="buyer-empty">+{productShipments.length - 3} more shipments in detailed history</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Modal is rendered separately below */}


              {latestOrder && (
                <p className="buyer-order-status">
                  Latest order #{latestOrder.order_number} is {latestOrder.status.toLowerCase()} since {new Date(latestOrder.created_at).toLocaleDateString()}.
                  Requested {formatQuantity(latestOrder.requested_quantity_kg, latestOrder.requested_unit)} delivery to {latestOrder.delivery_location} on {new Date(latestOrder.preferred_delivery_date).toLocaleDateString()}.
                  {activeOrders.length > 0 ? ` Open requests for this batch: ${activeOrders.length}.` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card buyer-shipment-history">
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2>My Full Shipment History</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowGlobalShipmentHistory((prev) => !prev)}
          >
            {showGlobalShipmentHistory ? 'Hide My History' : 'View My Full History'}
          </button>
        </div>
        {showGlobalShipmentHistory && (
          shipments.length === 0 ? (
            <p>No shipment records available yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Product / Batch</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Transporter</th>
                  <th>Region</th>
                  <th>Shipped</th>
                  <th>Delivered</th>
                  {user.role === 'buyer' && <th>Rate</th>}
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td><strong>{shipment.shipment_number}</strong></td>
                    <td>
                      {shipment.product_type}
                      <div className="buyer-mini-text">{shipment.batch_number}</div>
                    </td>
                    <td>{shipment.from_location} to {shipment.to_location}</td>
                    <td>
                      <span className={`badge ${shipment.status === 'DELIVERED' ? 'badge-green' : 'badge-blue'}`}>
                        {shipment.status}
                      </span>
                    </td>
                    <td>{shipment.transporter_name || 'N/A'}</td>
                    <td>{shipment.preferred_transporter_region || shipment.transporter_region || 'N/A'}</td>
                    <td>{shipment.shipped_at ? new Date(shipment.shipped_at).toLocaleString() : 'N/A'}</td>
                    <td>{shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString() : 'In transit'}</td>
                    {user.role === 'buyer' && (
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={shipment.status !== 'DELIVERED' || ratingShipmentId === shipment.id || !shipment.transporter_id}
                          onClick={() => rateTransporter(shipment)}
                        >
                          {ratingShipmentId === shipment.id ? 'Rating...' : 'Rate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {activeBuyFormBatchId && showBuyModal && (() => {
        const product = products.find((p) => p.batch_id === activeBuyFormBatchId);
        if (!product) return null;

        const deliveryDetails = getMergedDeliveryDetails(product);

        const requestedQuantityValue = deliveryDetails.requested_quantity ?? '';
        const requestedQuantity = Number(requestedQuantityValue);
        const requestedUnit = deliveryDetails.requested_unit || product.batch_unit;
        const availableQuantity = Number(product.available_quantity_kg);
        const batchUnit = product.batch_unit || 'kg';
        const quantityError = !String(requestedQuantityValue).trim()
          ? 'Enter the quantity you want to buy.'
          : !Number.isFinite(requestedQuantity)
            ? 'Quantity must be a valid number.'
            : requestedQuantity <= 0
              ? 'Quantity must be greater than zero.'
              : requestedQuantity > availableQuantity
                ? `Only ${formatQuantity(availableQuantity, batchUnit)} is available for this batch.`
                : normalizeUnit(requestedUnit) !== normalizeUnit(batchUnit)
                  ? `Unit must match the batch unit (${batchUnit}).`
                  : '';

        return (
          <div
            className="buyer-modal-overlay"
            role="presentation"
            onClick={() => {
              setShowBuyModal(false);
              setActiveBuyFormBatchId(null);
            }}
          >
            <div
              className="buyer-modal-shell"
              role="dialog"
              aria-modal="true"
              aria-labelledby="buy-delivery-form-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="buyer-modal-header">
                <h3 id="buy-delivery-form-title">Delivery Request Form</h3>
                <button
                  type="button"
                  className="buyer-modal-close"
                  aria-label="Close form"
                  onClick={() => {
                    setShowBuyModal(false);
                    setActiveBuyFormBatchId(null);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="buyer-modal-body">
                <div className="buyer-order-form-modal">
                  <div className="product-summary">
                    <h5 className="summary-title">Product Summary</h5>
                    <div className="summary-row">
                      <span className="summary-label">Product:</span>
                      <strong>{product.product_type}</strong>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Farm:</span>
                      <strong>{product.farm_name}</strong>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Available Quantity:</span>
                      <strong className="text-success">{formatQuantity(product.available_quantity_kg, product.batch_unit)}</strong>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Batch #:</span>
                      <strong>{product.batch_number}</strong>
                    </div>
                  </div>

                  <div className="form-section">
                    <h6 className="form-section-title">Delivery Details</h6>
                    <div className="quantity-unit-row">
                      <div className="form-group">
                        <label className="form-label">Quantity <span className="text-danger">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control"
                          placeholder="Enter quantity"
                          value={requestedQuantityValue}
                          onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                            ...prev,
                            [activeBuyFormBatchId]: {
                              ...deliveryDetails,
                              requested_quantity: e.target.value
                            }
                          }))}
                        />
                        <div className="field-hint">Available now: {formatQuantity(availableQuantity, batchUnit)}</div>
                        {quantityError && <div className="field-error">{quantityError}</div>}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Unit</label>
                        <input
                          type="text"
                          className="form-control"
                          value={batchUnit}
                          readOnly
                          title="Unit is fixed to the batch unit"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Delivery Location <span className="text-danger">*</span></label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter delivery location"
                        value={deliveryDetails.delivery_location}
                        onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                          ...prev,
                          [activeBuyFormBatchId]: {
                            ...deliveryDetails,
                            delivery_location: e.target.value
                          }
                        }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Preferred Delivery Date <span className="text-danger">*</span></label>
                      <input
                        type="date"
                        className="form-control"
                        value={deliveryDetails.preferred_delivery_date}
                        onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                          ...prev,
                          [activeBuyFormBatchId]: {
                            ...deliveryDetails,
                            preferred_delivery_date: e.target.value
                          }
                        }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Contact Name (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Receiver contact name"
                        value={deliveryDetails.delivery_contact_name}
                        onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                          ...prev,
                          [activeBuyFormBatchId]: {
                            ...deliveryDetails,
                            delivery_contact_name: e.target.value
                          }
                        }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Contact Phone (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Receiver contact phone"
                        value={deliveryDetails.delivery_contact_phone}
                        onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                          ...prev,
                          [activeBuyFormBatchId]: {
                            ...deliveryDetails,
                            delivery_contact_phone: e.target.value
                          }
                        }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Delivery Instructions (Optional)</label>
                      <textarea
                        className="form-control"
                        placeholder="Add notes for unloading or handover"
                        rows="3"
                        value={deliveryDetails.delivery_instructions}
                        onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                          ...prev,
                          [activeBuyFormBatchId]: {
                            ...deliveryDetails,
                            delivery_instructions: e.target.value
                          }
                        }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Preferred Transporter (Optional)</label>
                      <select
                        className="form-control"
                        value={deliveryDetails.preferred_transporter_id || ''}
                        onChange={(e) => {
                          const selectedTransporter = transporters.find((item) => String(item.id) === String(e.target.value));
                          setDeliveryDetailsByBatch((prev) => ({
                            ...prev,
                            [activeBuyFormBatchId]: {
                              ...deliveryDetails,
                              preferred_transporter_id: e.target.value,
                              preferred_transporter_name: selectedTransporter?.name || ''
                            }
                          }));
                        }}
                      >
                        <option value="">Auto assign from marketplace</option>
                        {transporters.map((transporter) => (
                          <option key={transporter.id} value={transporter.id}>
                            {transporter.name} • {transporter.region || 'No region'} • {formatRating(transporter.rating)} ★
                          </option>
                        ))}
                      </select>
                      <div className="field-hint">
                        Select a transporter for this order. Region and rating are shown in the marketplace above.
                      </div>
                      {deliveryDetails.preferred_transporter_name && (
                        <div className="selected-transporter-chip">
                          Selected: {deliveryDetails.preferred_transporter_name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="buyer-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowBuyModal(false);
                    setActiveBuyFormBatchId(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-success"
                  disabled={
                    orderingBatchId === activeBuyFormBatchId ||
                    !String(deliveryDetails.delivery_location || '').trim() ||
                    !deliveryDetails.preferred_delivery_date ||
                    Boolean(quantityError)
                  }
                  onClick={() => handleBuy(product)}
                >
                  {orderingBatchId === activeBuyFormBatchId ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Dashboard({ user }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      api.get('/fraud/dashboard'),
      api.get('/batches?limit=5'),
      api.get('/certificates?limit=5')
    ]).then(([fraud, batches, certs]) => {
      const fraudData = fraud.status === 'fulfilled'
        ? fraud.value.data
        : { statistics: { open_flags: 0, high_severity: 0 }, recent_flags: [] };
      const batchData = batches.status === 'fulfilled' ? batches.value.data : { batches: [] };
      const certData = certs.status === 'fulfilled' ? certs.value.data : { certificates: [] };
      const hasRequestError = [fraud, batches, certs].some(result => result.status === 'rejected');

      setStats({
        fraud: {
          statistics: fraudData.statistics || { open_flags: 0, high_severity: 0 },
          recent_flags: fraudData.recent_flags || []
        },
        recent_batches: batchData.batches || [],
        recent_certs: certData.certificates || [],
        error: hasRequestError ? 'Some dashboard data could not be loaded. Please refresh shortly.' : ''
      });
    });
  }, []);

  if (!stats) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <h1>Welcome, {user.name}</h1>

      {stats.error && <div className="error-msg">{stats.error}</div>}
      
      <div className="stats-grid">
        <StatCard
          icon={<AlertTriangle />}
          title="Open Fraud Flags"
          value={stats.fraud.statistics.open_flags || 0}
          color="red"
        />
        <StatCard
          icon={<Package />}
          title="Total Batches"
          value={stats.recent_batches.length}
          color="blue"
        />
        <StatCard
          icon={<FileText />}
          title="Certificates Issued"
          value={stats.recent_certs.length}
          color="green"
        />
        <StatCard
          icon={<ShieldAlert />}
          title="High Severity"
          value={stats.fraud.statistics.high_severity || 0}
          color="orange"
        />
      </div>

      {stats.fraud.recent_flags.length > 0 && (
        <div className="card">
          <h2>Recent Fraud Flags</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Batch</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {stats.fraud.recent_flags.map(flag => (
                <tr key={flag.id}>
                  <td>{flag.flag_type.replace(/_/g, ' ')}</td>
                  <td>{flag.batch_number}</td>
                  <td><span className={`badge badge-${flag.severity.toLowerCase()}`}>{flag.severity}</span></td>
                  <td><span className="badge">{flag.status}</span></td>
                  <td>{new Date(flag.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, title, value, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <h3>{value}</h3>
        <p>{title}</p>
      </div>
    </div>
  );
}

function BatchList({ user }) {
  const [batches, setBatches] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/batches').then(res => setBatches(res.data.batches));
  }, []);

  return (
    <div className="page-container shipments-page">
      <div className="page-header">
        <h1>Batches</h1>
        {(user.role === 'inspector' || user.role === 'admin') && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            Create Batch
          </button>
        )}
      </div>

      {showCreate && (
        <CreateBatchForm
          onClose={() => setShowCreate(false)}
          onCreated={(batch) => {
            setBatches([batch, ...batches]);
            setShowCreate(false);
          }}
        />
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Batch Number</th>
              <th>Farm</th>
              <th>Region</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Grade</th>
              <th>Harvest Date</th>
              <th>Certificates</th>
              <th>Shipments</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(batch => (
              <tr key={batch.id}>
                <td><strong>{batch.batch_number}</strong></td>
                <td>{batch.farm_name}</td>
                <td>{batch.region || batch.farm_location}</td>
                <td>{batch.product_type}</td>
                <td>{parseFloat(batch.quantity_kg).toLocaleString()}</td>
                <td>{batch.batch_unit || 'kg'}</td>
                <td><span className="badge badge-green">{batch.quality_grade}</span></td>
                <td>{new Date(batch.harvest_date).toLocaleDateString()}</td>
                <td>{batch.certificate_count}</td>
                <td>{batch.shipment_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateBatchForm({ onClose, onCreated }) {
  const [formData, setFormData] = useState({
    farm_name: '',
    farm_location: '',
    region: '',
    product_type: '',
    quantity_kg: '',
    batch_unit: 'kg',
    harvest_date: '',
    quality_grade: 'A'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/batches', formData);
      onCreated(res.data.batch);
    } catch (err) {
      alert('Failed to create batch');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Batch</h2>
        <form onSubmit={handleSubmit} className="form">
          <input
            type="text"
            placeholder="Farm Name"
            value={formData.farm_name}
            onChange={(e) => setFormData({...formData, farm_name: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Farm Location"
            value={formData.farm_location}
            onChange={(e) => setFormData({...formData, farm_location: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Region / Zone"
            value={formData.region}
            onChange={(e) => setFormData({...formData, region: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Product Type (e.g., Wheat, Rice)"
            value={formData.product_type}
            onChange={(e) => setFormData({...formData, product_type: e.target.value})}
            required
          />
          <input
            type="number"
            placeholder="Quantity"
            value={formData.quantity_kg}
            onChange={(e) => setFormData({...formData, quantity_kg: e.target.value})}
            required
          />
          <select
            value={formData.batch_unit}
            onChange={(e) => setFormData({...formData, batch_unit: e.target.value})}
            required
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="ton">ton</option>
            <option value="quintal">quintal</option>
          </select>
          <input
            type="date"
            value={formData.harvest_date}
            onChange={(e) => setFormData({...formData, harvest_date: e.target.value})}
            required
          />
          <select
            value={formData.quality_grade}
            onChange={(e) => setFormData({...formData, quality_grade: e.target.value})}
          >
            <option value="A+">A+ Premium</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
          <div className="modal-actions">
            <button type="submit" className="btn-primary">Create Batch</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CertificateList({ user }) {
  const [certificates, setCertificates] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/certificates').then(res => setCertificates(res.data.certificates));
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Certificates</h1>
        {(user.role === 'inspector' || user.role === 'admin') && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            Issue Certificate
          </button>
        )}
      </div>

      {showCreate && (
        <CreateCertificateForm
          onClose={() => setShowCreate(false)}
          onCreated={(cert) => {
            setCertificates([cert, ...certificates]);
            setShowCreate(false);
          }}
        />
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Cert Number</th>
              <th>Batch</th>
              <th>Product</th>
              <th>Inspector</th>
              <th>Issued</th>
              <th>Status</th>
              <th>QR Code</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map(cert => (
  <tr key={cert.id}>
    <td><strong>{cert.cert_number}</strong></td>
    <td>{cert.batch_number}</td>
    <td>{cert.product_type}</td>
    <td>{cert.inspector_name}</td>
    <td>{new Date(cert.issued_at).toLocaleDateString()}</td>

    <td>
      {cert.is_valid ? (
        <span className="badge badge-green">Valid</span>
      ) : (
        <span className="badge badge-red">Revoked</span>
      )}
    </td>

    {/* ✅ QR IMAGE FROM BACKEND */}
    <td>
      <a
        href={`/verify/${cert.qr_code}`}
        target="_blank"
        rel="noopener noreferrer"
        className="qr-table-link"
        title={`Open verification link: ${window.location.origin}/verify/${cert.qr_code}`}
      >
        <img
          src={cert.qr_code_image}
          alt="QR"
          width={60}
        />
      </a>
    </td>

    <td>
      <div className="cert-actions" style={{ display: 'flex', gap: '0.5rem' }}>
        {cert.pdf_url ? (
          <a
            href={cert.certificate_pdf_url || getFileUrl(cert.pdf_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary cert-view-btn"
          >
            View PDF
          </a>
        ) : (
          <span className="buyer-mini-text">No PDF</span>
        )}

        {(user.role === 'inspector' || user.role === 'admin') && cert.is_valid && (
          <button 
            className="btn-secondary" 
            style={{ color: '#ef4444', borderColor: '#ef4444' }}
            onClick={async () => {
              const reason = window.prompt("Enter reason for revocation:", "Safety concern");
              if (!reason) return;
              try {
                await api.post(`/certificates/${cert.id}/revoke`, { reason });
                alert("Certificate revoked successfully.");
                const res = await api.get('/certificates');
                setCertificates(res.data.certificates);
              } catch (err) {
                alert("Failed to revoke certificate.");
              }
            }}
          >
            Revoke
          </button>
        )}
      </div>
    </td>
  </tr>
))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateCertificateForm({ onClose, onCreated }) {
  const [batches, setBatches] = useState([]);
  const [formData, setFormData] = useState({
    batch_id: '',
    inspector_notes: '',
    pdf: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/batches').then(res => setBatches(res.data.batches));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('batch_id', formData.batch_id);
      formDataToSend.append('inspector_notes', formData.inspector_notes);
      
      if (formData.pdf) {
        formDataToSend.append('pdf', formData.pdf);
      }

      const res = await api.post('/certificates', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      onCreated(res.data.certificate);
      alert('Certificate issued successfully! QR code generated.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to issue certificate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="app-modal cert-modal-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cert-modal-header">
          <h2>Issue Certificate</h2>
          <button type="button" className="cert-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cert-modal-body">
        <form onSubmit={handleSubmit} className="form">
          <select
            value={formData.batch_id}
            onChange={(e) => setFormData({...formData, batch_id: e.target.value})}
            required
          >
            <option value="">Select Batch</option>
            {batches.map(batch => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_number} - {batch.product_type} ({formatQuantity(batch.quantity_kg, batch.batch_unit)})
              </option>
            ))}
          </select>

          <textarea
            placeholder="Inspector Notes (optional)"
            value={formData.inspector_notes}
            onChange={(e) => setFormData({...formData, inspector_notes: e.target.value})}
            rows="3"
          />

          <div className="cert-file-field">
            <label>
              Upload Certificate PDF (optional)
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFormData({...formData, pdf: e.target.files[0]})}
              className="cert-file-input"
            />
            {formData.pdf && <div className="field-hint">Selected: {formData.pdf.name}</div>}
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Issuing...' : 'Issue Certificate'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

function CreateShipmentForm({ onClose, onCreated, deliveryRequest }) {
  const [formData, setFormData] = useState({
    distance_km: '',
    weight_kg: deliveryRequest?.requested_quantity_kg || '',
    vehicle_number: '',
    expected_delivery_date: deliveryRequest?.preferred_delivery_date || '',
    current_location: deliveryRequest?.pickup_location || '',
    delivery_notes: '',
    delivered_to_name: '',
    status: 'PENDING'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        order_id: deliveryRequest.order_id,
        distance_km: formData.distance_km || null,
        weight_kg: formData.weight_kg,
        vehicle_number: formData.vehicle_number,
        expected_delivery_date: formData.expected_delivery_date || null,
        current_location: formData.current_location || deliveryRequest.pickup_location,
        delivery_notes: formData.delivery_notes || null,
        delivered_to_name: formData.status === 'DELIVERED'
          ? (formData.delivered_to_name || null)
          : null,
        status: formData.status
      };

      const res = await api.post('/shipments', payload);
      onCreated(res.data.shipment);
      alert('Shipment created successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create shipment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Shipment for Approved Request</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="buyer-mini-text">
            <strong>Order:</strong> {deliveryRequest.order_number}
          </div>
          <div className="buyer-mini-text">
            <strong>Batch:</strong> {deliveryRequest.batch_number} ({deliveryRequest.product_type})
          </div>
          <div className="buyer-mini-text">
            <strong>Requested:</strong> {formatQuantity(deliveryRequest.requested_quantity_kg, deliveryRequest.requested_unit)}
          </div>

          <label>Pickup Location (from batch)</label>
          <input
            type="text"
            value={deliveryRequest.pickup_location}
            readOnly
            title="Pickup location from batch creation"
          />

          <label>Buyer Delivery Location</label>
          <input
            type="text"
            value={deliveryRequest.delivery_location}
            readOnly
            title="Delivery location requested by buyer"
          />

          <label>Expected Delivery Date</label>
          <input
            type="date"
            value={formData.expected_delivery_date}
            onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
          />

          <label>Distance (km)</label>
          <input
            type="number"
            step="0.01"
            placeholder="Distance (km)"
            value={formData.distance_km}
            onChange={(e) => setFormData({...formData, distance_km: e.target.value})}
            required
          />

          <label>Shipment Quantity</label>
          <input
            type="number"
            step="0.01"
            placeholder="Shipment quantity"
            value={formData.weight_kg}
            onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}
            required
          />

          <label>Vehicle Number</label>
          <input
            type="text"
            placeholder="Vehicle Number (e.g., MH01AB1234)"
            value={formData.vehicle_number}
            onChange={(e) => setFormData({...formData, vehicle_number: e.target.value})}
            required
          />

          <label>Current Shipment Location</label>
          <input
            type="text"
            placeholder="Current shipment location"
            value={formData.current_location}
            onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
          />

          <label>Receiver Name At Delivery (optional)</label>
          <input
            type="text"
            placeholder="Receiver person name (not location)"
            value={formData.delivered_to_name}
            disabled={formData.status !== 'DELIVERED'}
            onChange={(e) => setFormData({ ...formData, delivered_to_name: e.target.value })}
          />

          <label>Shipment Notes (optional)</label>
          <textarea
            placeholder="Shipment notes (optional)"
            rows="2"
            value={formData.delivery_notes}
            onChange={(e) => setFormData({ ...formData, delivery_notes: e.target.value })}
          />

          <label>Initial Shipment Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value})}
          >
            <option value="PENDING">Pending</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
          </select>

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Shipment'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FraudDashboard({ user }) {
  const [flags, setFlags] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/fraud/flags'),
      api.get('/fraud/dashboard')
    ]).then(([flagsRes, statsRes]) => {
      setFlags(flagsRes.data.flags);
      setStats(statsRes.data.statistics);
    });
  }, []);


  // ✅ ADDED FUNCTION (new)
  const investigateFlag = async (flagId) => {
    try {

      await api.post('/cases', {
        flag_id: flagId
      });

      alert("Case created");

      const flagsRes = await api.get('/fraud/flags');
      setFlags(flagsRes.data.flags);

    } catch (err) {
      console.log(err);
      alert("Failed to create case");
    }
  };


  const runScan = async () => {
    try {
      const res = await api.post('/fraud/scan');
      alert(
        'Fraud scan completed! Found ' +
        Object.values(res.data.results).flat().length +
        ' new flags'
      );
      window.location.reload();
    } catch (err) {
      alert('Scan failed');
    }
  };


  return (
    <div className="page-container">

      <div className="page-header">
        <h1>Fraud Detection Dashboard</h1>

        <button onClick={runScan} className="btn-primary">
          <Bell size={18} /> Run Fraud Scan
        </button>

      </div>


      {stats && (
        <div className="stats-grid">
          <StatCard icon={<AlertTriangle />} title="Total Flags" value={stats.total_flags} color="blue" />
          <StatCard icon={<Search />} title="Open" value={stats.open_flags} color="orange" />
          <StatCard icon={<ShieldAlert />} title="High Severity" value={stats.high_severity} color="red" />
          <StatCard icon={<CheckCircle />} title="Investigating" value={stats.investigating_flags} color="purple" />
        </div>
      )}


      <div className="card">
        <h2>Fraud Flags</h2>

        <table className="table">

          <thead>
            <tr>
              <th>Type</th>
              <th>Batch</th>
              <th>Description</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
              <th>Case</th>
            </tr>
          </thead>

          <tbody>

            {flags.map(flag => (

              <tr key={flag.id}>

                <td>
                  <strong>
                    {flag.flag_type.replace(/_/g, ' ')}
                  </strong>
                </td>

                <td>{flag.batch_number}</td>

                <td>{flag.description}</td>

                <td>
                  <span className={`badge badge-${flag.severity.toLowerCase()}`}>
                    {flag.severity}
                  </span>
                </td>

                <td>
                  <span className={`badge ${
                    flag.status === 'OPEN'
                      ? 'badge-orange'
                      : flag.status === 'INVESTIGATING'
                      ? 'badge-blue'
                      : 'badge-gray'
                  }`}>
                    {flag.status}
                  </span>
                </td>

                <td>
                  {new Date(flag.created_at).toLocaleDateString()}
                </td>


                {/* ✅ CHANGED ONLY THIS PART */}
                <td>

                  {flag.case_number ? (

                    flag.case_number

                  ) : (

                    <button
                      className="btn-primary"
                      onClick={() => investigateFlag(flag.id)}
                    >
                      Investigate
                    </button>

                  )}

                </td>


              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}
function ShipmentsPage({ user }) {

  const [shipments, setShipments] = useState([]);
  const [shipmentDrafts, setShipmentDrafts] = useState({});
  const [savingShipmentId, setSavingShipmentId] = useState(null);
  const [shipmentQueue, setShipmentQueue] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [transporterProfile, setTransporterProfile] = useState(null);
  const role = (user?.role || '').toString().trim().toLowerCase();
  const canManageShipments = ['transporter', 'admin', 'fraud_analyst'].includes(role);
  const canManageQueue = role === 'transporter' || role === 'admin';
  const isAnalyst = role === 'fraud_analyst';
  const isTransporter = role === 'transporter';

  useEffect(() => {
    loadShipments();
    if (canManageQueue) {
      loadShipmentQueue();
    }
  }, [canManageQueue]);

  useEffect(() => {
    if (!isTransporter) return;

    api.get('/transporters/marketplace', {
      params: user?.region ? { region: user.region } : {}
    })
      .then((res) => {
        const match = (res.data.transporters || []).find((item) => Number(item.id) === Number(user.id));
        setTransporterProfile(match || null);
      })
      .catch(() => setTransporterProfile(null));
  }, [isTransporter, user?.id, user?.region]);


  const loadShipments = async () => {
    try {

      const res = await api.get("/shipments");

      const allShipments = res.data.shipments || [];
      setShipments(allShipments);
      setShipmentDrafts(
        allShipments.reduce((acc, shipment) => {
          acc[shipment.id] = {
            status: shipment.status,
            current_location: shipment.current_location || '',
            delivered_to_name: shipment.delivered_to_name || '',
            delivery_notes: shipment.delivery_notes || '',
            expected_delivery_date: shipment.expected_delivery_date
              ? new Date(shipment.expected_delivery_date).toISOString().slice(0, 10)
              : '',
            weight_kg: shipment.weight_kg || ''
          };
          return acc;
        }, {})
      );

    } catch (err) {
      console.log(err);
    }
  };

  const loadShipmentQueue = async () => {
    try {
      const res = await api.get('/shipments/queue');
      setShipmentQueue(res.data.requests || []);
    } catch (err) {
      console.log(err);
    }
  };


  const updateShipmentDraft = (id, field, value) => {
    setShipmentDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const saveShipmentUpdate = async (id) => {
    try {
      const draft = shipmentDrafts[id];
      if (!draft) return;

      if (isAnalyst) {
        if (draft.status !== 'CANCELLED') {
          alert('Fraud analyst can only mark shipment status as CANCELLED.');
          return;
        }

        if (!draft.delivery_notes || !draft.delivery_notes.trim()) {
          alert('Please enter fraud reason in notes before cancelling shipment.');
          return;
        }
      }

      setSavingShipmentId(id);

      const payload = isAnalyst
        ? {
            status: draft.status,
            delivery_notes: draft.delivery_notes || null,
            fraud_reason: draft.delivery_notes || null
          }
        : {
            status: draft.status,
            current_location: draft.current_location || null,
            delivered_to_name: draft.status === 'DELIVERED'
              ? (draft.delivered_to_name || null)
              : null,
            delivery_notes: draft.delivery_notes || null,
            expected_delivery_date: draft.expected_delivery_date || null,
            weight_kg: draft.weight_kg || null
          };

      if (!isAnalyst && draft.status === 'DELIVERED') {
        payload.delivered_at = new Date().toISOString();
      }

      await api.put(`/shipments/${id}`, payload);

      alert("Updated");

      loadShipments();
      if (canManageQueue) {
        loadShipmentQueue();
      }

    } catch (err) {
      console.log(err);
      const serverError = err.response?.data?.error;
      if (serverError === 'Insufficient permissions') {
        alert('Your active login role does not have shipment update access. If you changed accounts in another tab, refresh and login again as transporter.');
      } else {
        alert(serverError || "Failed to update shipment");
      }
    } finally {
      setSavingShipmentId(null);
    }
  };


  return (
    <div className="page-container">

      <div className="page-header">
        <h1>Shipments</h1>
        <span className="buyer-mini-text">Role: {role || 'guest'}</span>
      </div>

      {isTransporter && transporterProfile && (
        <div className="card transporter-profile-card">
          <div className="marketplace-header">
            <div>
              <h2>Transporter Profile</h2>
              <p>Region-driven assignment with reputation built from completed deliveries.</p>
            </div>
            <span className="badge badge-blue">{transporterProfile.region || user.region || 'Region not set'}</span>
          </div>

          <div className="transporter-profile-grid">
            <div><span>Rating</span><strong>{formatRating(transporterProfile.rating)} ★</strong></div>
            <div><span>Reviews</span><strong>{transporterProfile.rating_count || 0}</strong></div>
            <div><span>Completed</span><strong>{transporterProfile.completed_shipments || 0}</strong></div>
            <div><span>Active</span><strong>{transporterProfile.active_shipments || 0}</strong></div>
          </div>
        </div>
      )}

      {selectedRequest && (
        <CreateShipmentForm
          deliveryRequest={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onCreated={() => {
            setSelectedRequest(null);
            loadShipments();
            loadShipmentQueue();
          }}
        />
      )}

      {canManageQueue && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2>Approved Requests Pending Shipment</h2>
          {shipmentQueue.length === 0 ? (
            <p>No approved requests are waiting for transporter assignment.</p>
          ) : (
            <div className="shipment-queue-grid">
              {shipmentQueue.map((req) => (
                <div key={req.order_id} className="shipment-queue-card">
                  <div className="shipment-card-top">
                    <strong>{req.order_number}</strong>
                    <span className="badge badge-blue">APPROVED</span>
                  </div>
                  <div className="shipment-card-meta">
                    <div><span>Buyer</span><strong>{req.buyer_name || 'N/A'}</strong></div>
                    <div><span>Batch</span><strong>{req.batch_number}</strong></div>
                    <div><span>Pickup</span><strong>{req.pickup_location}</strong></div>
                    <div><span>Delivery</span><strong>{req.delivery_location}</strong></div>
                    <div><span>Preferred Transporter</span><strong>{req.preferred_transporter_name || 'Auto assign'}</strong></div>
                    <div><span>Preferred Date</span><strong>{new Date(req.preferred_delivery_date).toLocaleDateString()}</strong></div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setSelectedRequest(req)}
                  >
                    Create Shipment
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>Shipment Operations</h2>
        {shipments.length === 0 ? (
          <p>No shipments found.</p>
        ) : (
          <div className="shipment-grid">
            {shipments.map(s => {
              const draft = shipmentDrafts[s.id] || {
                status: s.status,
                current_location: s.current_location || '',
                delivered_to_name: s.delivered_to_name || '',
                delivery_notes: s.delivery_notes || '',
                expected_delivery_date: s.expected_delivery_date
                  ? new Date(s.expected_delivery_date).toISOString().slice(0, 10)
                  : '',
                weight_kg: s.weight_kg || ''
              };
              const isCancelledLocked = s.status === 'CANCELLED';
              const isDeliveredLockedForTransporter = isTransporter && s.status === 'DELIVERED';
              const canEditTransitFields = canManageShipments && !isAnalyst && !isDeliveredLockedForTransporter && !isCancelledLocked;
              const canEditStatus = canManageShipments && !isDeliveredLockedForTransporter && !isCancelledLocked;

              return (
                <div key={s.id} className="shipment-card">
                  <div className="shipment-card-top">
                    <strong>{s.shipment_number}</strong>
                    <span className={`badge ${draft.status === 'DELIVERED' ? 'badge-green' : draft.status === 'IN_TRANSIT' ? 'badge-blue' : draft.status === 'PENDING' ? 'badge-orange' : 'badge-gray'}`}>
                      {draft.status}
                    </span>
                  </div>

                  <div className="shipment-card-meta">
                    <div><span>Order</span><strong>{s.order_number || 'N/A'}</strong></div>
                    <div><span>Batch</span><strong>{s.batch_number}</strong></div>
                    <div><span>From</span><strong>{s.from_location}</strong></div>
                    <div><span>Buyer Destination</span><strong>{s.to_location}</strong></div>
                    <div><span>Delivered At</span><strong>{s.delivered_at ? new Date(s.delivered_at).toLocaleString() : 'N/A'}</strong></div>
                  </div>

                  <div className="shipment-edit-grid">
                    <div>
                      <label>Expected Delivery</label>
                      <input
                        type="date"
                        value={draft.expected_delivery_date}
                        disabled={!canEditTransitFields}
                        onChange={(e) => updateShipmentDraft(s.id, 'expected_delivery_date', e.target.value)}
                        title="Expected delivery date"
                      />
                    </div>
                    <div>
                      <label>Weight (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={draft.weight_kg}
                        disabled={!canEditTransitFields}
                        onChange={(e) => updateShipmentDraft(s.id, 'weight_kg', e.target.value)}
                        placeholder="Current total weight"
                        title="Record final weight upon delivery to detect skimming"
                      />
                    </div>
                    <div>
                      <label>Current Location</label>
                      <input
                        type="text"
                        value={draft.current_location}
                        disabled={!canEditTransitFields}
                        onChange={(e) => updateShipmentDraft(s.id, 'current_location', e.target.value)}
                        placeholder="Current location"
                      />
                    </div>
                    <div>
                      <label>Receiver Name (delivery)</label>
                      <input
                        type="text"
                        value={draft.delivered_to_name}
                        disabled={!canEditTransitFields || draft.status !== 'DELIVERED'}
                        onChange={(e) => updateShipmentDraft(s.id, 'delivered_to_name', e.target.value)}
                        placeholder="Receiver person name"
                      />
                    </div>
                    <div>
                      <label>Notes</label>
                      <input
                        type="text"
                        value={draft.delivery_notes}
                        disabled={!canManageShipments || isDeliveredLockedForTransporter || isCancelledLocked}
                        onChange={(e) => updateShipmentDraft(s.id, 'delivery_notes', e.target.value)}
                        placeholder={isAnalyst ? 'Fraud reason (required for cancellation)' : 'Delivery notes'}
                      />
                    </div>
                    <div>
                      <label>Status</label>
                      <select
                        value={draft.status}
                        disabled={!canEditStatus}
                        onChange={(e) => updateShipmentDraft(s.id, 'status', e.target.value)}
                      >
                        {isAnalyst ? (
                          <>
                            <option value={s.status}>{s.status}</option>
                            {s.status !== 'CANCELLED' && <option value="CANCELLED">CANCELLED</option>}
                          </>
                        ) : (
                          <>
                            <option value="PENDING">PENDING</option>
                            <option value="IN_TRANSIT">IN_TRANSIT</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {isDeliveredLockedForTransporter && (
                    <p className="buyer-mini-text">Locked: transporter cannot modify shipment after delivery.</p>
                  )}

                  {isCancelledLocked && (
                    <p className="buyer-mini-text">Locked: cancelled shipment cannot be modified.</p>
                  )}

                  <div className="shipment-card-actions">
                    {canManageShipments ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={savingShipmentId === s.id || isDeliveredLockedForTransporter || isCancelledLocked}
                        onClick={() => saveShipmentUpdate(s.id)}
                      >
                        {savingShipmentId === s.id ? 'Saving...' : (isDeliveredLockedForTransporter || isCancelledLocked) ? 'Locked' : 'Save'}
                      </button>
                    ) : (
                      <span className="buyer-mini-text">Read-only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
}

function OrdersPage({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const canView = ['buyer', 'admin', 'fraud_analyst'].includes(user.role);
  const canReview = ['admin', 'fraud_analyst'].includes(user.role);
  const canFulfill = user.role === 'admin';

  const loadOrders = useCallback(async () => {
    if (!canView) return;

    setLoading(true);
    try {
      const endpoint = user.role === 'buyer' ? '/orders/my' : '/orders';
      const res = await api.get(endpoint);
      setOrders(res.data.orders || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [canView, user.role]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const reviewOrder = async (orderId, nextStatus) => {
    setUpdatingOrderId(orderId);

    try {
      let payload = { status: nextStatus };
      if (nextStatus === 'REJECTED') {
        const reason = window.prompt('Enter rejection reason');
        if (!reason || !reason.trim()) {
          alert('Rejection reason is required');
          return;
        }
        payload = { ...payload, rejection_reason: reason.trim() };
      }

      await api.patch(`/orders/${orderId}/review`, payload);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to review order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const fulfillOrder = async (orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/fulfill`);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to fulfill order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const cancelOrder = async (orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/cancel`);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (!canView) {
    return (
      <div className="page-container">
        <h1>Orders</h1>
        <div className="card">
          <p>You do not have permission to view orders.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading orders...</div>;

  const filteredOrders = statusFilter === 'ALL'
    ? orders
    : orders.filter((order) => order.status === statusFilter);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{user.role === 'buyer' ? 'My Orders' : 'Order Management'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label htmlFor="orderStatusFilter">Status</label>
          <select
            id="orderStatusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            <option value="REQUESTED">Requested</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="card">
        {filteredOrders.length === 0 ? (
          <p>No orders found for selected filter.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Order #</th>
                {user.role !== 'buyer' && <th>Buyer</th>}
                <th>Batch</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Delivery Location</th>
                <th>Preferred Transporter</th>
                <th>Preferred Delivery</th>
                <th>Status</th>
                <th>Shipment</th>
                <th>Created</th>
                <th>Reviewed By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.order_number}</strong></td>
                  {user.role !== 'buyer' && <td>{order.buyer_name || 'N/A'}</td>}
                  <td>{order.batch_number}</td>
                  <td>{order.product_type}</td>
                  <td>{parseFloat(order.requested_quantity_kg).toLocaleString()}</td>
                  <td>{order.requested_unit || 'kg'}</td>
                  <td>{order.delivery_location}</td>
                  <td>
                    <div>{order.preferred_transporter_name || 'Auto assign'}</div>
                    <div className="buyer-mini-text">{order.preferred_transporter_region || ''}</div>
                  </td>
                  <td>{new Date(order.preferred_delivery_date).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      order.status === 'FULFILLED' ? 'green'
                        : order.status === 'APPROVED' ? 'blue'
                        : order.status === 'REQUESTED' ? 'orange'
                        : order.status === 'REJECTED' ? 'red'
                        : 'gray'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{order.shipment_number || 'Not created'}</td>
                  <td>{new Date(order.created_at).toLocaleDateString()}</td>
                  <td>{order.reviewed_by_name || 'N/A'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {canReview && order.status === 'REQUESTED' && (
                        <>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={updatingOrderId === order.id}
                            onClick={() => reviewOrder(order.id, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={updatingOrderId === order.id}
                            onClick={() => reviewOrder(order.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {canFulfill && order.status === 'APPROVED' && (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={updatingOrderId === order.id}
                          onClick={() => fulfillOrder(order.id)}
                        >
                          Fulfill
                        </button>
                      )}

                      {(user.role === 'buyer' || user.role === 'admin') && (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={
                            updatingOrderId === order.id ||
                            !['REQUESTED', ...(user.role === 'admin' ? ['APPROVED'] : [])].includes(order.status)
                          }
                          onClick={() => cancelOrder(order.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {order.rejection_reason && (
                      <div className="buyer-mini-text" style={{ marginTop: '0.3rem' }}>
                        Reason: {order.rejection_reason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function CaseList({ user }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCases = useCallback(async () => {
    try {
      const res = await api.get('/cases');
      setCases(res.data.cases || []);
    } catch (err) {
      alert('Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleCloseCase = async (caseId) => {
    const decision = window.prompt('Enter decision (FRAUD or NOT_FRAUD):', 'FRAUD');
    if (!decision) return;
    
    const reason = window.prompt('Enter reason for this decision:');
    if (!reason) return;

    try {
      await api.post(`/cases/${caseId}/close`, {
        decision: decision.toUpperCase(),
        decision_reason: reason
      });
      alert('Case resolved successfully');
      loadCases();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close case');
    }
  };

  if (loading) return <div className="loading">Loading cases...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Investigation Cases</h1>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Case #</th>
              <th>Flag Type</th>
              <th>Batch</th>
              <th>Region</th>
              <th>Analyst</th>
              <th>Priority</th>
              <th>Decision</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id}>
                <td><strong>{c.case_number}</strong></td>
                <td>{c.flag_type?.replace(/_/g, ' ')}</td>
                <td>{c.batch_number}</td>
                <td>{c.batch_region || 'N/A'}</td>
                <td>{c.analyst_name}</td>
                <td><span className="badge">{c.priority}</span></td>
                <td>
                  <span className={`badge ${
                    c.decision === 'FRAUD' ? 'badge-red' :
                    c.decision === 'NOT_FRAUD' ? 'badge-green' : 'badge-gray'
                  }`}>
                    {c.decision}
                  </span>
                </td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                  {c.decision === 'PENDING' && (
                    <button 
                      className="btn-primary" 
                      onClick={() => handleCloseCase(c.id)}
                    >
                      Resolve
                    </button>
                  )}
                  {c.decision !== 'PENDING' && (
                    <div className="buyer-mini-text">Resolved</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VerifyCertificate() {
  const { qrCode } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/verify/${qrCode}`)
      .then(res => setResult(res.data))
      .catch(err => setResult({ valid: false, message: err.response?.data?.message || 'Verification failed' }))
      .finally(() => setLoading(false));
  }, [qrCode]);

  if (loading) return <div className="loading">Verifying certificate...</div>;

  return (
    <div className="verify-container">
      <div className="verify-box">
        <div className={`verify-status ${result.valid ? 'valid' : 'invalid'}`}>
          {result.valid ? <CheckCircle size={64} /> : <XCircle size={64} />}
          <h1>{result.valid ? 'Certificate Valid' : 'Certificate Invalid'}</h1>
        </div>

        {result.certificate ? (
          <div className="verify-details">
            <h2>Certificate Details</h2>
            <div className="detail-row">
              <span>Certificate Number:</span>
              <strong>{result.certificate.cert_number}</strong>
            </div>
            <div className="detail-row">
              <span>Batch Number:</span>
              <strong>{result.certificate.batch_number}</strong>
            </div>
            <div className="detail-row">
              <span>Product:</span>
              <strong>{result.certificate.product_type}</strong>
            </div>
            <div className="detail-row">
              <span>Farm:</span>
              <strong>{result.certificate.farm_name}</strong>
            </div>
            <div className="detail-row">
              <span>Quantity:</span>
              <strong>{formatQuantity(result.certificate.quantity_kg, result.certificate.batch_unit)}</strong>
            </div>
            <div className="detail-row">
              <span>Quality Grade:</span>
              <strong>{result.certificate.quality_grade}</strong>
            </div>
            <div className="detail-row">
              <span>Inspector:</span>
              <strong>{result.certificate.inspector_name}</strong>
            </div>
            <div className="detail-row">
              <span>Issued:</span>
              <strong>{new Date(result.certificate.issued_at).toLocaleDateString()}</strong>
            </div>

            {result.warnings && result.warnings.length > 0 && (
              <div className="warnings">
                <h3><AlertTriangle /> Warnings</h3>
                {result.warnings.map((w, i) => (
                  <div key={i} className="warning-item">{w}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p>{result.message}</p>
        )}
      </div>
    </div>
  );
}

export default App;
