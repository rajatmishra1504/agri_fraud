const { generateSystemDocumentation } = require('./server/utils/projectDocsGenerator');
const path = require('path');
const fs = require('fs');

const run = async () => {
    const outputDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    const outputPath = path.join(outputDir, 'Agri-Fraud-System-Documentation.pdf');
    try {
        console.log('Generating Professional Documentation PDF...');
        await generateSystemDocumentation(outputPath);
        console.log('PDF Generated successfully at:', outputPath);
    } catch (err) {
        console.error('Error generating PDF:', err);
    }
};

run();
