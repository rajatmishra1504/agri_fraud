import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, CheckCircle, XCircle, ShieldAlert, Package, FileText, Truck, Home, LogOut, Bell, Search, ShoppingCart, ScanLine } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api');

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        {user ? (
          <>
            <Navbar user={user} logout={logout} />
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
            <Route path="/shipments" element={<ShipmentsPage user={user} />} />

          </Routes>
        )}
      </div>
    </Router>
  );
}

function Navbar({ user, logout }) {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <ShieldAlert className="nav-icon" />
        <span>AgriFraud Detector</span>
      </div>
      <div className="nav-links">
        <Link to="/"><Home size={18} /> Dashboard</Link>
        <Link to="/batches"><Package size={18} /> Batches</Link>
        <Link to="/certificates"><FileText size={18} /> Certificates</Link>
        <Link to="/shipments"><Truck size={18} /> Shipments</Link>
        {(user.role === 'buyer' || user.role === 'fraud_analyst' || user.role === 'admin') && (
          <Link to="/orders"><ShoppingCart size={18} /> Orders</Link>
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
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    role: 'buyer'
  });

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
      <div className="login-box">
        <div className="login-header">
          <ShieldAlert size={48} />
          <h1>Agriculture Fraud Detection</h1>
          <p>Secure, Transparent, Trustworthy</p>
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
        <div className="demo-credentials">
          <p><strong>Demo Credentials:</strong></p>
          <p>Inspector: inspector1@agri.com / password123</p>
          <p>Analyst: analyst1@agri.com / password123</p>
          <p>Admin: admin@agri.com / password123</p>
        </div>
      </div>
    </div>
  );
}

function BuyerDashboard({ user }) {
  const [products, setProducts] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveryDetailsByBatch, setDeliveryDetailsByBatch] = useState({});
  const [activeBuyFormBatchId, setActiveBuyFormBatchId] = useState(null);
  const [visibleShipmentHistoryByBatch, setVisibleShipmentHistoryByBatch] = useState({});
  const [showGlobalShipmentHistory, setShowGlobalShipmentHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [orderingBatchId, setOrderingBatchId] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/certificates?limit=40'),
      api.get('/batches?limit=40'),
      api.get('/shipments'),
      api.get('/orders/my')
    ])
      .then(([certificatesRes, batchesRes, shipmentsRes, ordersRes]) => {
        const batchesById = new Map(batchesRes.data.batches.map(batch => [batch.id, batch]));
        const seenBatchIds = new Set();
        const mappedProducts = [];

        for (const cert of certificatesRes.data.certificates) {
          if (seenBatchIds.has(cert.batch_id)) continue;

          const batch = batchesById.get(cert.batch_id);
          if (!batch) continue;

          seenBatchIds.add(cert.batch_id);
          mappedProducts.push({
            id: cert.id,
            batch_id: cert.batch_id,
            batch_number: cert.batch_number,
            product_type: cert.product_type,
            farm_name: cert.farm_name,
            quantity_kg: batch.quantity_kg,
            quality_grade: batch.quality_grade,
            inspector_name: cert.inspector_name,
            cert_number: cert.cert_number,
            qr_code: cert.qr_code,
            is_cert_valid: cert.is_valid,
            issued_at: cert.issued_at,
            description: `${cert.product_type} from ${cert.farm_name}, inspected and certified for traceability.`
          });
        }

        setProducts(mappedProducts);
        setShipments(shipmentsRes.data.shipments || []);
        setOrders(ordersRes.data.orders || []);
      })
      .finally(() => setLoading(false));
  }, []);

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
    const deliveryDetails = deliveryDetailsByBatch[product.batch_id] || {};
    if (!deliveryDetails.delivery_location?.trim()) {
      alert('Please enter a delivery location before placing the request.');
      return;
    }
    if (!deliveryDetails.preferred_delivery_date) {
      alert('Please select a preferred delivery date before placing the request.');
      return;
    }

    setOrderingBatchId(product.batch_id);

    try {
      await api.post('/orders', {
        batch_id: product.batch_id,
        requested_quantity_kg: product.quantity_kg,
        delivery_location: deliveryDetails.delivery_location.trim(),
        preferred_delivery_date: deliveryDetails.preferred_delivery_date,
        delivery_contact_name: deliveryDetails.delivery_contact_name?.trim() || null,
        delivery_contact_phone: deliveryDetails.delivery_contact_phone?.trim() || null,
        delivery_instructions: deliveryDetails.delivery_instructions?.trim() || null,
        notes: `Buyer request for ${product.product_type} (${product.batch_number})`
      });

      const refreshedOrders = await api.get('/orders/my');
      setOrders(refreshedOrders.data.orders || []);
      setDeliveryDetailsByBatch((prev) => ({
        ...prev,
        [product.batch_id]: {
          delivery_location: '',
          preferred_delivery_date: '',
          delivery_contact_name: '',
          delivery_contact_phone: '',
          delivery_instructions: ''
        }
      }));
      setActiveBuyFormBatchId(null);
      alert(`Purchase request created for ${product.product_type} (${product.batch_number})`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create purchase request');
    } finally {
      setOrderingBatchId(null);
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

      <div className="buyer-products-grid">
        {products.map((product) => {
          const deliveryDetails = deliveryDetailsByBatch[product.batch_id] || {
            delivery_location: '',
            preferred_delivery_date: '',
            delivery_contact_name: '',
            delivery_contact_phone: '',
            delivery_instructions: ''
          };
          const activeOrders = orders.filter(
            order => order.batch_id === product.batch_id && ['REQUESTED', 'APPROVED'].includes(order.status)
          );
          const latestOrder = orders.find(order => order.batch_id === product.batch_id);
          const available = product.is_cert_valid;
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
                <QRCodeSVG
                  value={`${window.location.origin}/verify/${product.qr_code}`}
                  size={120}
                  level="M"
                  includeMargin
                />
                <p>Scan to verify authenticity</p>
              </div>

              <div className="buyer-product-meta">
                <div><span>Farm</span><strong>{product.farm_name}</strong></div>
                <div><span>Quantity</span><strong>{parseFloat(product.quantity_kg).toLocaleString()} kg</strong></div>
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
                  disabled={!available || orderingBatchId === product.batch_id}
                  onClick={() => setActiveBuyFormBatchId((prev) =>
                    prev === product.batch_id ? null : product.batch_id
                  )}
                >
                  <ShoppingCart size={16} />
                  {activeBuyFormBatchId === product.batch_id ? 'Close Buy Form' : 'Buy Product'}
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

              {activeBuyFormBatchId === product.batch_id && (
                <div className="card" style={{ marginTop: '1rem' }}>
                  <h4>Delivery Request Details</h4>
                  <div className="form">
                    <input
                      type="text"
                      placeholder="Delivery location"
                      value={deliveryDetails.delivery_location}
                      onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                        ...prev,
                        [product.batch_id]: {
                          ...deliveryDetails,
                          delivery_location: e.target.value
                        }
                      }))}
                    />
                    <input
                      type="date"
                      value={deliveryDetails.preferred_delivery_date}
                      onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                        ...prev,
                        [product.batch_id]: {
                          ...deliveryDetails,
                          preferred_delivery_date: e.target.value
                        }
                      }))}
                    />
                    <input
                      type="text"
                      placeholder="Delivery contact name (optional)"
                      value={deliveryDetails.delivery_contact_name}
                      onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                        ...prev,
                        [product.batch_id]: {
                          ...deliveryDetails,
                          delivery_contact_name: e.target.value
                        }
                      }))}
                    />
                    <input
                      type="text"
                      placeholder="Delivery contact phone (optional)"
                      value={deliveryDetails.delivery_contact_phone}
                      onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                        ...prev,
                        [product.batch_id]: {
                          ...deliveryDetails,
                          delivery_contact_phone: e.target.value
                        }
                      }))}
                    />
                    <textarea
                      placeholder="Delivery instructions (optional)"
                      rows="2"
                      value={deliveryDetails.delivery_instructions}
                      onChange={(e) => setDeliveryDetailsByBatch((prev) => ({
                        ...prev,
                        [product.batch_id]: {
                          ...deliveryDetails,
                          delivery_instructions: e.target.value
                        }
                      }))}
                    />
                    <div className="buyer-product-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={
                          orderingBatchId === product.batch_id ||
                          !deliveryDetails.delivery_location.trim() ||
                          !deliveryDetails.preferred_delivery_date
                        }
                        onClick={() => handleBuy(product)}
                      >
                        {orderingBatchId === product.batch_id ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {latestOrder && (
                <p className="buyer-order-status">
                  Latest order #{latestOrder.order_number} is {latestOrder.status.toLowerCase()} since {new Date(latestOrder.created_at).toLocaleDateString()}.
                  Requested delivery to {latestOrder.delivery_location} on {new Date(latestOrder.preferred_delivery_date).toLocaleDateString()}.
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
                  <th>Shipped</th>
                  <th>Delivered</th>
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
                    <td>{shipment.shipped_at ? new Date(shipment.shipped_at).toLocaleString() : 'N/A'}</td>
                    <td>{shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString() : 'In transit'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
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
              <th>Product</th>
              <th>Quantity (kg)</th>
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
                <td>{batch.product_type}</td>
                <td>{parseFloat(batch.quantity_kg).toLocaleString()}</td>
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
    product_type: '',
    quantity_kg: '',
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
            placeholder="Product Type (e.g., Wheat, Rice)"
            value={formData.product_type}
            onChange={(e) => setFormData({...formData, product_type: e.target.value})}
            required
          />
          <input
            type="number"
            placeholder="Quantity (kg)"
            value={formData.quantity_kg}
            onChange={(e) => setFormData({...formData, quantity_kg: e.target.value})}
            required
          />
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
      <img
        src={cert.qr_code_image}
        alt="QR"
        width={60}
      />
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Issue Certificate</h2>
        <form onSubmit={handleSubmit} className="form">
          <select
            value={formData.batch_id}
            onChange={(e) => setFormData({...formData, batch_id: e.target.value})}
            required
          >
            <option value="">Select Batch</option>
            {batches.map(batch => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_number} - {batch.product_type} ({batch.quantity_kg} kg)
              </option>
            ))}
          </select>

          <textarea
            placeholder="Inspector Notes (optional)"
            value={formData.inspector_notes}
            onChange={(e) => setFormData({...formData, inspector_notes: e.target.value})}
            rows="3"
          />

          <div>
            <label style={{display: 'block', marginBottom: '0.5rem', color: '#616161'}}>
              Upload Certificate PDF (optional)
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFormData({...formData, pdf: e.target.files[0]})}
              style={{
                padding: '0.875rem 1rem',
                border: '2px solid #E0E0E0',
                borderRadius: '10px',
                width: '100%'
              }}
            />
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
        delivered_to_name: formData.delivered_to_name || null,
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Shipment for Approved Request</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="buyer-mini-text">
            <strong>Order:</strong> {deliveryRequest.order_number}
          </div>
          <div className="buyer-mini-text">
            <strong>Batch:</strong> {deliveryRequest.batch_number} ({deliveryRequest.product_type})
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

          <label>Shipment Weight (kg)</label>
          <input
            type="number"
            step="0.01"
            placeholder="Weight (kg)"
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

          <label>Delivered To (optional)</label>
          <input
            type="text"
            placeholder="Delivered to (optional)"
            value={formData.delivered_to_name}
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
  const canManageShipments = user.role === 'transporter' || user.role === 'admin';

  useEffect(() => {
    loadShipments();
    if (canManageShipments) {
      loadShipmentQueue();
    }
  }, [canManageShipments]);


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

      setSavingShipmentId(id);

      const payload = {
        status: draft.status,
        current_location: draft.current_location || null,
        delivered_to_name: draft.delivered_to_name || null,
        delivery_notes: draft.delivery_notes || null,
        expected_delivery_date: draft.expected_delivery_date || null,
        weight_kg: draft.weight_kg || null
      };

      if (draft.status === 'DELIVERED') {
        payload.delivered_at = new Date().toISOString();
      }

      await api.put(`/shipments/${id}`, payload);

      alert("Updated");

      loadShipments();
      if (canManageShipments) {
        loadShipmentQueue();
      }

    } catch (err) {
      console.log(err);
      alert("Failed");
    } finally {
      setSavingShipmentId(null);
    }
  };


  return (
    <div className="page-container">

      <div className="page-header">
        <h1>Shipments</h1>
      </div>

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

      {canManageShipments && (
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
                    <div><span>To</span><strong>{s.to_location}</strong></div>
                    <div><span>Delivered At</span><strong>{s.delivered_at ? new Date(s.delivered_at).toLocaleString() : 'N/A'}</strong></div>
                  </div>

                  <div className="shipment-edit-grid">
                    <div>
                      <label>Expected Delivery</label>
                      <input
                        type="date"
                        value={draft.expected_delivery_date}
                        disabled={!canManageShipments}
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
                        disabled={!canManageShipments}
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
                        disabled={!canManageShipments}
                        onChange={(e) => updateShipmentDraft(s.id, 'current_location', e.target.value)}
                        placeholder="Current location"
                      />
                    </div>
                    <div>
                      <label>Delivered To</label>
                      <input
                        type="text"
                        value={draft.delivered_to_name}
                        disabled={!canManageShipments}
                        onChange={(e) => updateShipmentDraft(s.id, 'delivered_to_name', e.target.value)}
                        placeholder="Receiver"
                      />
                    </div>
                    <div>
                      <label>Notes</label>
                      <input
                        type="text"
                        value={draft.delivery_notes}
                        disabled={!canManageShipments}
                        onChange={(e) => updateShipmentDraft(s.id, 'delivery_notes', e.target.value)}
                        placeholder="Delivery notes"
                      />
                    </div>
                    <div>
                      <label>Status</label>
                      <select
                        value={draft.status}
                        disabled={!canManageShipments}
                        onChange={(e) => updateShipmentDraft(s.id, 'status', e.target.value)}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="IN_TRANSIT">IN_TRANSIT</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </div>
                  </div>

                  <div className="shipment-card-actions">
                    {canManageShipments ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={savingShipmentId === s.id}
                        onClick={() => saveShipmentUpdate(s.id)}
                      >
                        {savingShipmentId === s.id ? 'Saving...' : 'Save'}
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
                <th>Quantity (kg)</th>
                <th>Delivery Location</th>
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
                  <td>{order.delivery_location}</td>
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

  useEffect(() => {
    api.get('/cases').then(res => setCases(res.data.cases));
  }, []);

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
              <th>Analyst</th>
              <th>Priority</th>
              <th>Decision</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id}>
                <td><strong>{c.case_number}</strong></td>
                <td>{c.flag_type?.replace(/_/g, ' ')}</td>
                <td>{c.batch_number}</td>
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
              <strong>{parseFloat(result.certificate.quantity_kg).toLocaleString()} kg</strong>
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
