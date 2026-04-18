const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateSystemDocumentation = async (outputPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // ==========================================
    // PAGE 1: TITLE PAGE
    // ==========================================
    doc.fontSize(30).fillColor('#27ae60').text('AGRI-FRAUD DETECTION', 50, 200, { align: 'center' });
    doc.fontSize(20).fillColor('#2c3e50').text('& TRACEABILITY SYSTEM', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(14).fillColor('#7f8c8d').text('Official Project Whitepaper & Documentation', { align: 'center' });
    doc.moveDown(15);
    doc.fontSize(10).fillColor('#bdc3c7').text('Agri-Fraud Tech Solution | 2026 Edition', { align: 'center' });

    doc.addPage();

    // ==========================================
    // PAGE 2: EXECUTIVE SUMMARY
    // ==========================================
    doc.fontSize(22).fillColor('#27ae60').text('1. Executive Summary', 50, 50);
    doc.moveDown();
    doc.fontSize(12).fillColor('#34495e').text(
      'The Agri-Fraud Detection System is a secure, AI-powered platform designed to bring transparency to the agricultural supply chain. By utilizing digital certification and Machine Learning, the system identifies anomalies, prevents certificate forgery, and streamlines the transaction between buyers and producers.',
      { align: 'justify' }
    );
    
    doc.moveDown(2);
    doc.fontSize(18).fillColor('#27ae60').text('2. Core Advantages');
    doc.moveDown();

    const advantages = [
        ['Enhanced Trust', 'Every batch is digitally signed and traceable via a non-forgeable QR code.'],
        ['Fraud Prevention', 'Automated ML scanning detects impossible travel speeds and weight inconsistencies.'],
        ['Workflow Automation', 'Automatic PDF generation and status updates reduce manual paperwork by 70%.'],
        ['Comprehensive Audit', 'A full immutable log of every action ensures 100% accountability.']
    ];

    advantages.forEach(([title, desc]) => {
        doc.fontSize(12).fillColor('#27ae60').text(`• ${title}: `, { continued: true }).fillColor('#34495e').text(desc);
        doc.moveDown(0.5);
    });

    doc.addPage();

    // ==========================================
    // PAGE 3: SYSTEM COMPONENTS
    // ==========================================
    doc.fontSize(22).fillColor('#27ae60').text('3. System Architecture', 50, 50);
    doc.moveDown();
    
    const components = [
        ['Frontend Dashboards', 'React-based portals for Inspectors, Transporters, Buyers, and Analysts.'],
        ['Secure API Core', 'A Node.js/Express backend with JWT authentication and rate limiting.'],
        ['ML Engine', 'A Random Forest Classifier that scores shipments for potential fraud risk.'],
        ['Database Integrity', 'PostgreSQL with optimized indexing for lightning-fast traceability checks.']
    ];

    components.forEach(([title, desc]) => {
        doc.fontSize(12).fillColor('#27ae60').text(`- ${title}: `, { continued: true }).fillColor('#34495e').text(desc);
        doc.moveDown(0.5);
    });

    doc.moveDown(2);
    doc.fontSize(18).fillColor('#27ae60').text('4. Key Innovations');
    doc.moveDown();
    doc.fontSize(12).fillColor('#34495e').text(
        'The project features several high-end developer implementations including real-time System Health Telemetry, an interactive Visual API documentation explorer, and automated QR-embedded certificates.',
        { align: 'justify' }
    );

    doc.moveDown(5);
    doc.fontSize(10).fillColor('#95a5a6').text('End of Document. Generated on ' + new Date().toLocaleDateString(), { align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', (err) => reject(err));
  });
};

module.exports = { generateSystemDocumentation };
