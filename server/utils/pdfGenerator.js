const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates an official Agriculture Certificate PDF
 * @param {Object} data - Batch and Certificate details
 * @param {string} qrCodeDataUrl - QR Code image data URL (base64)
 * @param {string} outputPath - Where to save the PDF
 */
const generateCertificatePdf = async (data, qrCodeDataUrl, outputPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 50
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // 1. Add Decorative Border
    doc.rect(20, 20, 555, 802).lineWidth(2).stroke('#27ae60');
    doc.rect(25, 25, 545, 792).lineWidth(1).stroke('#2ecc71');

    // 2. Header
    doc.fontSize(25).fillColor('#27ae60').text('OFFICIAL AGRICULTURE CERTIFICATE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#7f8c8d').text('Agri-Fraud Detection & Traceability System', { align: 'center' });
    
    doc.moveDown(2);
    doc.strokeColor('#bdc3c7').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(2);

    // 3. Certificate Info
    doc.fillColor('#2c3e50').fontSize(14).text(`Certificate ID: ${data.cert_number}`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Issued Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Expiry Date: ${new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString()}`);

    doc.moveDown(2);

    // 4. Batch Details Section
    doc.fontSize(16).fillColor('#27ae60').text('Batch Details', { underline: true });
    doc.moveDown();

    const detailX = 70;
    const valueX = 220;
    let currentY = doc.y;

    const details = [
        ['Batch Number:', data.batch_number],
        ['Product Type:', data.product_type],
        ['Farm Name:', data.farm_name],
        ['Region/Location:', data.farm_location || data.region],
        ['Quantity:', `${data.quantity_kg} ${data.batch_unit || 'kg'}`],
        ['Quality Grade:', data.quality_grade]
    ];

    doc.fontSize(12).fillColor('#34495e');
    details.forEach(([label, value]) => {
        doc.text(label, detailX, currentY);
        doc.fillColor('#2c3e50').text(value, valueX, currentY);
        doc.fillColor('#34495e');
        currentY += 25;
    });

    doc.y = currentY + 30;

    // 5. Notes
    if (data.inspector_notes) {
        doc.moveDown();
        doc.fontSize(14).fillColor('#27ae60').text('Inspector remarks:');
        doc.fontSize(10).fillColor('#7f8c8d').text(data.inspector_notes);
    }

    // 6. QR Code (Positioned at bottom right)
    if (qrCodeDataUrl) {
        const qrSize = 120;
        const qrX = 400;
        const qrY = 650;
        
        // Remove the data:image/png;base64, prefix
        const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, "");
        const qrBuffer = Buffer.from(base64Data, 'base64');
        
        doc.image(qrBuffer, qrX, qrY, { width: qrSize });
        doc.fontSize(8).fillColor('#95a5a6').text('Scan to verify authenticity', qrX, qrY + qrSize + 5, { width: qrSize, align: 'center' });
    }

    // 7. Footer / Signature
    doc.fontSize(10).fillColor('#2c3e50').text('Issued By:', 50, 700);
    doc.fontSize(12).text(data.inspector_name || 'Authorized Agri-Inspector', 50, 715);
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor('#95a5a6').text('Digitally Signed & Secured by Agri-Fraud Traceability Engine', 50, 730);

    // 8. Seal
    doc.circle(500, 100, 40).lineWidth(3).stroke('#27ae60');
    doc.fontSize(10).fillColor('#27ae60').text('OFFICIAL', 480, 92);
    doc.text('SEAL', 488, 104);

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', (err) => reject(err));
  });
};

module.exports = { generateCertificatePdf };
