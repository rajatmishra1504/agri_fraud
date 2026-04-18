const fs = require('fs');
const path = require('path');

const getApiDocsHtml = (baseUrl) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agri-Fraud API Documentation</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2ecc71;
            --primary-dark: #27ae60;
            --bg: #f8fafc;
            --sidebar-bg: #1e293b;
            --sidebar-text: #f1f5f9;
            --text-main: #334155;
            --text-muted: #64748b;
            --card-bg: #ffffff;
            --border: #e2e8f0;
            --get: #3b82f6;
            --post: #10b981;
            --put: #f59e0b;
            --delete: #ef4444;
            --patch: #8b5cf6;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }

        /* Sidebar */
        .sidebar {
            width: 300px;
            background-color: var(--sidebar-bg);
            color: var(--sidebar-text);
            padding: 2rem 1.5rem;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            border-right: 1px solid var(--border);
        }

        .sidebar h2 {
            font-size: 1.25rem;
            margin-bottom: 2rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--primary);
        }

        .sidebar-nav h3 {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin: 1.5rem 0 0.75rem 0;
        }

        .sidebar-nav ul {
            list-style: none;
        }

        .sidebar-nav a {
            color: var(--sidebar-text);
            text-decoration: none;
            font-size: 0.9rem;
            display: block;
            padding: 0.5rem 0;
            transition: color 0.2s;
            opacity: 0.8;
        }

        .sidebar-nav a:hover {
            color: var(--primary);
            opacity: 1;
        }

        /* Main Content */
        .main-content {
            flex: 1;
            margin-left: 300px;
            padding: 3rem 4rem;
            max-width: 1000px;
        }

        .header {
            margin-bottom: 4rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 2rem;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 1rem;
            color: #0f172a;
        }

        .base-url {
            background: #e2e8f0;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-family: 'Fira Code', monospace;
            font-size: 0.9rem;
            display: inline-block;
        }

        /* Endpoint Card */
        .endpoint {
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px solid var(--border);
            margin-bottom: 3rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            scroll-margin-top: 2rem;
        }

        .endpoint-header {
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 1px solid var(--border);
            background: #fafafa;
        }

        .method {
            padding: 0.25rem 0.75rem;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.75rem;
            color: white;
            min-width: 60px;
            text-align: center;
        }

        .method.get { background-color: var(--get); }
        .method.post { background-color: var(--post); }
        .method.put { background-color: var(--put); }
        .method.patch { background-color: var(--patch); }
        .method.delete { background-color: var(--delete); }

        .path {
            font-family: 'Fira Code', monospace;
            font-weight: 600;
            font-size: 1rem;
        }

        .role-badge {
            margin-left: auto;
            font-size: 0.7rem;
            background: #f1f5f9;
            padding: 0.2rem 0.6rem;
            border-radius: 20px;
            border: 1px solid var(--border);
            color: var(--text-muted);
        }

        .endpoint-body {
            padding: 1.5rem;
        }

        .endpoint-desc {
            margin-bottom: 1.5rem;
            color: var(--text-muted);
            font-size: 0.95rem;
        }

        .section-title {
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--text-main);
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 1rem;
            border-radius: 8px;
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
            overflow-x: auto;
            margin-bottom: 1.5rem;
        }

        .param-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }

        .param-table th {
            text-align: left;
            padding: 0.75rem;
            background: #f8fafc;
            border-bottom: 2px solid var(--border);
        }

        .param-table td {
            padding: 0.75rem;
            border-bottom: 1px solid var(--border);
        }

        .param-name { font-weight: 600; color: var(--primary-dark); }
        .param-type { color: var(--text-muted); font-size: 0.8rem; }

        @media (max-width: 768px) {
            .sidebar { display: none; }
            .main-content { margin-left: 0; padding: 2rem; }
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <h2>🌾 Agri-Fraud API</h2>
        <nav class="sidebar-nav">
            <h3>Authentication</h3>
            <ul>
                <li><a href="#register">Register</a></li>
                <li><a href="#login">Login</a></li>
            </ul>
            
            <h3>Batches & Inventory</h3>
            <ul>
                <li><a href="#list-batches">List Batches</a></li>
                <li><a href="#create-batch">Create Batch</a></li>
            </ul>

            <h3>Certificates</h3>
            <ul>
                <li><a href="#issue-cert">Issue Certificate</a></li>
                <li><a href="#verify-cert">Verify (Public)</a></li>
            </ul>

            <h3>Supply Chain</h3>
            <ul>
                <li><a href="#list-shipments">List Shipments</a></li>
                <li><a href="#update-shipment">Update Transit</a></li>
                <li><a href="#marketplace">Transporter Mkt</a></li>
            </ul>

            <h3>Fraud Intelligence</h3>
            <ul>
                <li><a href="#fraud-stats">Dashboard Stats</a></li>
                <li><a href="#run-scan">Trigger ML Scan</a></li>
            </ul>
        </nav>
    </aside>

    <main class="main-content">
        <header class="header">
            <h1>API Reference</h1>
            <p>Welcome to the Agriculture Fraud Detection System API. Access traceability, certificates, and fraud intelligence modules.</p>
            <div style="margin-top: 1.5rem;">
                <span class="base-url">${baseUrl}</span>
            </div>
        </header>

        <!-- REGISTER -->
        <section id="register" class="endpoint">
            <div class="endpoint-header">
                <span class="method post">POST</span>
                <span class="path">/auth/register</span>
                <span class="role-badge">Public</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Register a new user in the system. Roles determine access permissions.</p>
                <div class="section-title">Request Body</div>
                <pre>{
  "email": "user@agri.com",
  "password": "password123",
  "name": "Jane Doe",
  "role": "inspector | transporter | buyer | fraud_analyst",
  "region": "Punjab",
  "organization": "AgriCo"
}</pre>
            </div>
        </section>

        <!-- LOGIN -->
        <section id="login" class="endpoint">
            <div class="endpoint-header">
                <span class="method post">POST</span>
                <span class="path">/auth/login</span>
                <span class="role-badge">Public</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Authenticate and receive a JWT token.</p>
                <pre>{
  "email": "user@agri.com",
  "password": "password123"
}</pre>
            </div>
        </section>

        <!-- CREATE BATCH -->
        <section id="create-batch" class="endpoint">
            <div class="endpoint-header">
                <span class="method post">POST</span>
                <span class="path">/batches</span>
                <span class="role-badge">Inspector | Admin</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Create a new agricultural batch for inspection.</p>
                <div class="section-title">Request Body</div>
                <pre>{
  "farm_name": "Golden Fields",
  "farm_location": "Amritsar, IN",
  "product_type": "Wheat",
  "quantity_kg": 5000,
  "quality_grade": "A+"
}</pre>
            </div>
        </section>

        <!-- ISSUE CERTIFICATE -->
        <section id="issue-cert" class="endpoint">
            <div class="endpoint-header">
                <span class="method post">POST</span>
                <span class="path">/certificates</span>
                <span class="role-badge">Inspector | Admin</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Issue a QR-coded certificate for a batch with PDF upload support.</p>
                <div class="section-title">Content-Type</div>
                <p style="font-size: 0.8rem; margin-bottom: 1rem;">multipart/form-data</p>
                <table class="param-table">
                    <tr><th>Field</th><th>Type</th><th>Description</th></tr>
                    <tr><td>batch_id</td><td>Integer</td><td>ID of the batch to certify</td></tr>
                    <tr><td>pdf</td><td>File</td><td>PDF version of the certificate</td></tr>
                </table>
            </div>
        </section>

        <!-- UPDATE SHIPMENT -->
        <section id="update-shipment" class="endpoint">
            <div class="endpoint-header">
                <span class="method put">PUT</span>
                <span class="path">/shipments/:id</span>
                <span class="role-badge">Transporter | Admin</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Update transit details. Setting status to DELIVERED triggers automatic ML fraud evaluation.</p>
                <pre>{
  "status": "IN_TRANSIT | DELIVERED",
  "current_location": "Warehouse B",
  "weight_kg": 4980
}</pre>
            </div>
        </section>

        <!-- RUN SCAN -->
        <section id="run-scan" class="endpoint">
            <div class="endpoint-header">
                <span class="method post">POST</span>
                <span class="path">/fraud/scan</span>
                <span class="role-badge">Analyst | Admin</span>
            </div>
            <div class="endpoint-body">
                <p class="endpoint-desc">Manually trigger the Machine Learning fraud detection engine to scan all shipments.</p>
                <div class="section-title">Response</div>
                <pre>{
  "message": "Scan complete",
  "flags_found": 12
}</pre>
            </div>
        </section>

        <footer style="margin-top: 5rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding-bottom: 3rem;">
            &copy; 2026 Agriculture Fraud Detection System. Protected by AI monitoring.
        </footer>
    </main>

    <script>
        // Smooth scrolling for sidebar links
        document.querySelectorAll('.sidebar-nav a').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector(this.getAttribute('href')).scrollIntoView({
                    behavior: 'smooth'
                });
            });
        });
    </script>
</body>
</html>
`;

module.exports = { getApiDocsHtml };
