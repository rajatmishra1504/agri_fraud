# 🎥 Project Documentation: Video Recording Workflow

This workflow is designed to help you record a professional demonstration of the **Agriculture Fraud Detection System**. It covers the end-to-end lifecycle of a batch and showcases all major fraud detection features.

---

## 🛠️ Phase 0: Preparation & Setup

Before you start recording, ensure your environment is clean and ready.

1.  **Reset Database**: Ensure you have fresh sample data.
    ```bash
    npm run migrate
    npm run seed
    ```
2.  **Start Services**:
    - Backend: `npm run dev`
    - Frontend: `npm run client`
3.  **Browser Setup**: Open the application at `http://localhost:3000` (or your local port).
4.  **Login Credentials**:
    - **Password for all**: `password123`
    - **Admin**: `admin@agri.com`
    - **Inspector**: `inspector1@agri.com`
    - **Transporter**: `transporter1@agri.com`
    - **Analyst**: `analyst1@agri.com`
    - **Buyer**: `buyer1@agri.com`

---

## 🎬 Scene 1: Introduction & Admin Dashboard
**Goal**: Show the high-level system status.

1.  **Login** as `admin@agri.com`.
2.  **Show Dashboard**: Highlight the real-time statistics (Total Batches, Active Flags, Open Cases).
3.  **Mention ML Engine**: Explain that the dashboard is powered by an in-memory cache and a Random Forest ML engine that scans for anomalies.
4.  **Audit Logs**: Briefly navigate to the Audit Logs section to show that every action is tracked (IP, User-Agent).

---

## 🎬 Scene 2: The Inspector (Batch & Certification)
**Goal**: Show how data enters the system and how certificates are issued.

1.  **Logout** and **Login** as `inspector1@agri.com`.
2.  **Create a New Batch**:
    - Go to "Batches" -> "Create Batch".
    - Farm: "Sunny Fields", Product: "Premium Wheat", Quantity: "5000kg".
3.  **Issue Certificate**:
    - Find the new batch and click "Issue Certificate".
    - Upload a sample PDF (you can use any small PDF).
    - **Key Feature**: Mention that the PDF is stored in **Cloudinary** and a unique cryptographic hash is generated to prevent tampering.
4.  **QR Code**: Show the generated QR code.

---

## 🎬 Scene 3: The Transporter (Shipment & Fraud Trigger)
**Goal**: Show the shipment lifecycle and trigger a fraud flag.

1.  **Logout** and **Login** as `transporter1@agri.com`.
2.  **Start Shipment**:
    - Select the batch created in Scene 2.
    - Set destination: "Coastal Port".
    - Click "Start Transit".
3.  **Trigger "Impossible Travel" (Demo Logic)**:
    - Mark the shipment as "Delivered" almost immediately.
    - Mention that the system calculates distance vs. time. If the speed exceeds 120km/h, a **High Severity** flag is raised.
4.  **Trigger "Abnormal Weight"**:
    - When marking as delivered, enter a lower weight (e.g., 4800kg instead of 5000kg).
    - Mention that this triggers the "Skimming Detection" logic.

---

## 🎬 Scene 4: The Fraud Analyst (Investigation)
**Goal**: Show how the system handles threats.

1.  **Logout** and **Login** as `analyst1@agri.com`.
2.  **View Flags**:
    - Go to "Fraud Dashboard" or "Flags".
    - Show the `IMPOSSIBLE_TRAVEL` and `ABNORMAL_WEIGHT` flags triggered in the previous scene.
3.  **Deep Dive**:
    - Click on a flag to see the "Evidence JSON".
    - Show how the system provides specific reasons (e.g., "Speed: 250km/h detected").
4.  **Open a Case**:
    - Click "Create Case" from a flag.
    - Assign it to yourself and add a note: *"Investigating possible skimming at checkpoint B."*
5.  **Close Case**:
    - Mark the decision as "CONFIRMED_FRAUD" or "FALSE_POSITIVE".

---

## 🎬 Scene 5: The Buyer (Verification)
**Goal**: Show the public-facing trust layer.

1.  **Verification Page**:
    - Navigate to the public `/verify` route (or use the "Verify" link in the header).
2.  **Public Trust**:
    - Explain that buyers can scan the QR code to see the certificate's validity and history without logging in.
    - Mention the **Dynamic IP Detection** feature that logs the location of scans to detect unauthorized distributions.

---

## 🎬 Scene 6: Conclusion
**Goal**: Summarize the tech stack.

1.  **Technical Recap**:
    - **Backend**: Node.js/Express.
    - **Database**: PostgreSQL (Relational integrity for audit logs).
    - **Security**: JWT, SHA-256 Hashing, Rate Limiting.
    - **AI/ML**: Random Forest Classifier for complex pattern detection.

---

## 💡 Recording Tips
- **Resolution**: Record in 1080p or 4K.
- **Microphone**: Use a dedicated mic if possible.
- **Pacing**: Don't rush through the dashboard; give the viewer time to read the labels.
- **Mouse**: Use a "highlight" tool for your cursor so it's easier to follow.
- **Editing**: Add text overlays when mentioning specific technologies like "PostgreSQL" or "Machine Learning".
