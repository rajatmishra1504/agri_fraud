# API Documentation

Base URL: `http://localhost:5000/api`

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Register User
**POST** `/auth/register`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "buyer|inspector|transporter|fraud_analyst|admin",
  "organization": "Company Name",
  "phone": "+1234567890"
}
```

Response:
```json
{
  "message": "User registered successfully",
  "user": {...},
  "token": "jwt_token_here"
}
```

### Login
**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

## Batches

### List Batches
**GET** `/batches?product_type=Wheat&farm_name=Green&limit=50&offset=0`

### Get Batch Details
**GET** `/batches/:id`

### Create Batch
**POST** `/batches` (Inspector, Admin only)

```json
{
  "farm_name": "Green Valley Farm",
  "farm_location": "Punjab, India",
  "product_type": "Wheat",
  "quantity_kg": 5000,
  "harvest_date": "2024-01-15",
  "quality_grade": "A"
}
```

## Certificates

### List Certificates
**GET** `/certificates?batch_id=1&limit=50&offset=0`

### Get Certificate
**GET** `/certificates/:id`

### Issue Certificate
**POST** `/certificates` (Inspector, Admin only)
Content-Type: multipart/form-data

Fields:
- `batch_id`: number
- `inspector_notes`: string
- `pdf`: file (PDF, max 10MB)

### Revoke Certificate
**POST** `/certificates/:id/revoke` (Inspector, Fraud Analyst, Admin)

```json
{
  "reason": "Fraudulent activity detected"
}
```

## Shipments

### List Shipments
**GET** `/shipments`

### Transporter Queue (Approved Requests)
**GET** `/shipments/queue` (Transporter, Admin)

Returns approved buyer requests that are not yet mapped to a shipment. Includes:
- pickup location from batch creation (`pickup_location`)
- buyer delivery location/date (`delivery_location`, `preferred_delivery_date`)

### Create Shipment
**POST** `/shipments` (Transporter, Admin)

```json
{
  "order_id": 12,
  "distance_km": 350.5,
  "weight_kg": 5000,
  "vehicle_number": "DL01AB1234",
  "expected_delivery_date": "2026-04-12",
  "current_location": "Punjab dispatch yard",
  "delivery_notes": "Keep away from moisture",
  "status": "PENDING"
}
```

When `order_id` is provided:
- pickup is auto-filled from batch (`farm_location`)
- delivery destination/date are pulled from buyer order
- one shipment per approved order is enforced

### Update Shipment
**PUT** `/shipments/:id` (Transporter, Admin)

```json
{
  "status": "DELIVERED|IN_TRANSIT|CANCELLED",
  "delivered_at": "2026-04-12T10:30:00Z",
  "weight_kg": 4980,
  "current_location": "Delhi warehouse",
  "delivered_to_name": "Warehouse Supervisor",
  "delivery_notes": "Received in good condition"
}
```

When updated to `DELIVERED`, linked approved order is auto-marked as `FULFILLED`.

## Purchase Orders

### Create Buyer Purchase Request
**POST** `/orders` (Buyer, Admin)

Note:
- Buyers can place multiple requests for the same batch over time (real-world repeat purchasing).
- Each approved request maps to its own shipment workflow.
- Identical repeat submits within a short safety window are rejected to prevent accidental double-click duplicates.

```json
{
  "batch_id": 1,
  "requested_quantity_kg": 1200,
  "delivery_location": "Delhi Central Warehouse",
  "preferred_delivery_date": "2026-04-12",
  "delivery_contact_name": "Rohit Sharma",
  "delivery_contact_phone": "+919999999999",
  "delivery_instructions": "Unload at gate 3",
  "notes": "Need clean and dry stock"
}
```

### List Buyer Orders
**GET** `/orders/my` (Buyer, Admin)

### List All Orders
**GET** `/orders` (Admin, Fraud Analyst)

Response now includes shipment linkage fields where available:
- `shipment_id`
- `shipment_number`
- `shipment_status`

## Fraud Detection

### Get Dashboard Stats
**GET** `/fraud/dashboard`

Response:
```json
{
  "statistics": {
    "total_flags": 45,
    "open_flags": 12,
    "investigating_flags": 8,
    "high_severity": 15,
    "by_type": {...}
  },
  "recent_flags": [...]
}
```

### List Fraud Flags
**GET** `/fraud/flags?status=OPEN&severity=HIGH&flag_type=CERTIFICATE_REUSE&limit=50&offset=0`

### Trigger Fraud Scan
**POST** `/fraud/scan` (Fraud Analyst, Admin)

Response:
```json
{
  "message": "Fraud scan completed",
  "results": {
    "certificateReuse": [...],
    "doubleDelivery": [...],
    "impossibleTravel": [...],
    "abnormalWeight": [...],
    "suspiciousInspector": [...]
  }
}
```

## Cases

### List Cases
**GET** `/cases`

### Create Case
**POST** `/cases` (Fraud Analyst, Admin)

```json
{
  "flag_id": 1,
  "priority": "HIGH|MEDIUM|LOW",
  "notes": "Initial investigation notes"
}
```

### Update Case
**PUT** `/cases/:id` (Fraud Analyst, Admin)

```json
{
  "notes": "Updated notes",
  "investigation_data": {...}
}
```

### Close Case
**POST** `/cases/:id/close` (Fraud Analyst, Admin)

```json
{
  "decision": "FRAUD|NOT_FRAUD",
  "decision_reason": "Evidence shows clear certificate reuse pattern"
}
```

## Public Endpoints

### Verify Certificate
**GET** `/verify/:qrCode` (No auth required)

Response:
```json
{
  "valid": true,
  "certificate": {
    "cert_number": "CERT-123-456",
    "batch_number": "BATCH-2024-001",
    "product_type": "Wheat",
    ...
  },
  "warnings": ["This batch has fraud flags"],
  "fraud_flag_count": 2
}
```

## Audit Logs

### Get Audit Logs
**GET** `/audit?user_id=1&entity_type=certificate&limit=100&offset=0` (Admin, Fraud Analyst)

Response:
```json
{
  "logs": [
    {
      "id": 1,
      "user_name": "John Inspector",
      "action": "ISSUE_CERTIFICATE",
      "entity_type": "certificate",
      "entity_id": 123,
      "metadata": {...},
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-20T10:30:00Z"
    }
  ]
}
```

## Error Responses

All endpoints return standard error format:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE" // optional
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Server Error

## Rate Limiting

API is rate limited to 100 requests per 15 minutes per IP address.

When rate limit is exceeded:
```json
{
  "error": "Too many requests, please try again later"
}
```

## Fraud Detection Rules

### 1. Certificate Reuse (HIGH)
- Same `cert_hash` used for multiple batches
- Triggers when duplicate hash detected

### 2. Double Delivery (HIGH)
- Same batch delivered to multiple locations
- Triggers when >1 DELIVERED shipments with different destinations

### 3. Impossible Travel (MEDIUM/HIGH)
- Delivery time < minimum possible travel time
- Calculates: `distance_km / max_speed_kmh`
- HIGH if average speed > 120 km/h
- MEDIUM if travel time unrealistically short

### 4. Abnormal Weight (MEDIUM)
- Weight change exceeds threshold (default 15%)
- Compares shipment weight vs original batch weight
- HIGH if >25% change, MEDIUM if >15%

### 5. Suspicious Inspector (MEDIUM)
- Inspector gives same grade >80% of the time
- Analyzed across >5 batches
- May indicate bias or corruption

## Webhooks (Future Enhancement)

Webhook events will be sent to configured endpoints:

- `fraud.flag.created`
- `certificate.issued`
- `certificate.revoked`
- `case.closed`

Payload format:
```json
{
  "event": "fraud.flag.created",
  "timestamp": "2024-01-20T10:30:00Z",
  "data": {...}
}
```
