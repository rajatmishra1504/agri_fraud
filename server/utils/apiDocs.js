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
            padding: 2rem 1.25rem;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            border-right: 1px solid var(--border);
            z-index: 100;
        }

        .sidebar h2 {
            font-size: 1.1rem;
            margin-bottom: 2rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--primary);
        }

        .sidebar-nav h3 {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #94a3b8;
            margin: 1.5rem 0 0.5rem 0;
        }

        .sidebar-nav ul {
            list-style: none;
        }

        .sidebar-nav a {
            color: var(--sidebar-text);
            text-decoration: none;
            font-size: 0.85rem;
            display: block;
            padding: 0.4rem 0;
            transition: all 0.2s;
            opacity: 0.7;
        }

        .sidebar-nav a:hover {
            color: var(--primary);
            opacity: 1;
        }

        /* Main Content */
        .main-content {
            flex: 1;
            margin-left: 300px;
            padding: 3rem 5rem;
            max-width: 1200px;
        }

        .header {
            margin-bottom: 4rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 2rem;
        }

        .header h1 {
            font-size: 2.2rem;
            font-weight: 800;
            margin-bottom: 0.75rem;
            color: #0f172a;
        }

        .base-url {
            background: #e2e8f0;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
            display: inline-block;
        }

        /* Section dividers */
        .doc-section {
            margin-bottom: 5rem;
        }
        
        .doc-section h2 {
            font-size: 1.5rem;
            color: #1e293b;
            margin-bottom: 2rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--primary);
            display: inline-block;
        }

        /* Endpoint Card */
        .endpoint {
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px solid var(--border);
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            overflow: hidden;
            scroll-margin-top: 2rem;
        }

        .endpoint-header {
            padding: 1.25rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 1px solid var(--border);
            background: #fafafa;
        }

        .method {
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            font-weight: 700;
            font-size: 0.7rem;
            color: white;
            min-width: 65px;
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
            font-size: 0.95rem;
            color: #334155;
        }

        .role-badge {
            margin-left: auto;
            font-size: 0.65rem;
            background: #f1f5f9;
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
            border: 1px solid var(--border);
            color: var(--text-muted);
            font-weight: 600;
        }

        .endpoint-body {
            padding: 1.5rem;
        }

        .endpoint-desc {
            margin-bottom: 1.25rem;
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 1.25rem;
            border-radius: 8px;
            font-family: 'Fira Code', monospace;
            font-size: 0.8rem;
            overflow-x: auto;
            margin-bottom: 1.5rem;
            border: 1px solid #334155;
        }

        @media (max-width: 900px) {
            .sidebar { display: none; }
            .main-content { margin-left: 0; padding: 2rem; }
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <h2>🌾 Agri-Fraud API</h2>
        <nav class="sidebar-nav">
            <h3>Auth & Account</h3>
            <ul>
                <li><a href="#register">Register</a></li>
                <li><a href="#login">Login</a></li>
            </ul>
            
            <h3>Inventory</h3>
            <ul>
                <li><a href="#list-batches">List Batches</a></li>
                <li><a href="#create-batch">Create Batch</a></li>
            </ul>

            <h3>Certificates</h3>
            <ul>
                <li><a href="#issue-cert">Issue Cert</a></li>
                <li><a href="#revoke-cert">Revoke Cert</a></li>
                <li><a href="#verify-cert">Public Verify</a></li>
            </ul>

            <h3>Marketplace</h3>
            <ul>
                <li><a href="#create-order">Create Request</a></li>
                <li><a href="#transporters">Transporters</a></li>
            </ul>

            <h3>Shipments</h3>
            <ul>
                <li><a href="#create-shipment">Create Shipment</a></li>
                <li><a href="#update-shipment">Update Transit</a></li>
            </ul>

            <h3>Intelligence</h3>
            <ul>
                <li><a href="#fraud-dashboard">Fraud Stats</a></li>
                <li><a href="#run-scan">Trigger ML Scan</a></li>
                <li><a href="#audit-logs">Audit Logs</a></li>
            </ul>
        </nav>
    </aside>

    <main class="main-content">
        <header class="header">
            <h1>API Reference Guide</h1>
            <p>Welcome to the verified Agri-Fraud API documentation. Use these endpoints to manage agriculture supply chains and fraud detection logic.</p>
            <div style="margin-top: 1.5rem;">
                <span class="base-url">Base API: ${baseUrl}</span>
            </div>
        </header>

        <!-- AUTH -->
        <section id="auth" class="doc-section">
            <h2>Authentication</h2>
            <div id="register" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/auth/register</span>
                    <span class="role-badge">Public</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Register a new user identity (Inspector, Transporter, Buyer, Analyst).</p>
                    <pre>{ "email": "j@test.com", "password": "pass", "name": "John", "role": "buyer" }</pre>
                </div>
            </div>

            <div id="login" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/auth/login</span>
                    <span class="role-badge">Public</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Generate a JWT Bearer token for secure access.</p>
                    <pre>{ "email": "j@test.com", "password": "pass" }</pre>
                </div>
            </div>
        </section>

        <!-- INVENTORY -->
        <section id="inventory" class="doc-section">
            <h2>Inventory</h2>
            <div id="list-batches" class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="path">/batches</span>
                    <span class="role-badge">Authenticated</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Fetch all agricultural batches in the system.</p>
                </div>
            </div>

            <div id="create-batch" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/batches</span>
                    <span class="role-badge">Inspector</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Create a new traceable agricultural batch.</p>
                    <pre>{ "farm_name": "Farm X", "product_type": "Rice", "quantity_kg": 1000 }</pre>
                </div>
            </div>
        </section>

        <!-- CERTIFICATES -->
        <section id="certificates" class="doc-section">
            <h2>Certificates</h2>
            <div id="issue-cert" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/certificates</span>
                    <span class="role-badge">Inspector</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Issue a QR-coded certificate (Automatic PDF generation included).</p>
                </div>
            </div>

            <div id="revoke-cert" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/certificates/:id/revoke</span>
                    <span class="role-badge">Admin</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Manually invalidate a certificate for fraud or non-compliance.</p>
                </div>
            </div>
            
            <div id="verify-cert" class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="path">/verify/:qrCode</span>
                    <span class="role-badge">Public</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Publicly verify the authenticity of a certificate via its QR token.</p>
                </div>
            </div>
        </section>

        <!-- MARKETPLACE -->
        <section id="marketplace" class="doc-section">
            <h2>Marketplace</h2>
            <div id="create-order" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/orders</span>
                    <span class="role-badge">Buyer</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Buyer request to purchase a specific batch.</p>
                </div>
            </div>

            <div id="transporters" class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="path">/transporters/marketplace</span>
                    <span class="role-badge">Authenticated</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Browse transporters by rating and region.</p>
                </div>
            </div>
        </section>

        <!-- SHIPMENTS -->
        <section id="shipments" class="doc-section">
            <h2>Shipments</h2>
            <div id="create-shipment" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/shipments</span>
                    <span class="role-badge">Transporter</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Initialize a new shipment transit.</p>
                </div>
            </div>

            <div id="update-shipment" class="endpoint">
                <div class="endpoint-header">
                    <span class="method put">PUT</span>
                    <span class="path">/shipments/:id</span>
                    <span class="role-badge">Transporter</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Update location and weight during transit.</p>
                </div>
            </div>
        </section>

        <!-- INTELLIGENCE -->
        <section id="intelligence" class="doc-section">
            <h2>Intelligence</h2>
            <div id="fraud-dashboard" class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="path">/fraud/dashboard</span>
                    <span class="role-badge">Analyst</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">View fraud flags and systemic risk stats.</p>
                </div>
            </div>

            <div id="run-scan" class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="path">/fraud/scan</span>
                    <span class="role-badge">Analyst</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Manually trigger the ML scanning engine.</p>
                </div>
            </div>

            <div id="audit-logs" class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="path">/audit</span>
                    <span class="role-badge">Admin</span>
                </div>
                <div class="endpoint-body">
                    <p class="endpoint-desc">Full system activity trail.</p>
                </div>
            </div>
        </section>

        <footer style="margin-top: 5rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding-bottom: 3rem;">
            &copy; 2026 Agriculture Fraud Detection System. Professional API Explorer.
        </footer>
    </main>

    <script>
        document.querySelectorAll('.sidebar-nav a').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const element = document.querySelector(targetId);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    </script>
</body>
</html>
`;

module.exports = { getApiDocsHtml };
