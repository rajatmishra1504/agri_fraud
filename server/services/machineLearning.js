const { RandomForestClassifier } = require('ml-random-forest');

class FraudMLEngine {
  constructor() {
    this.model = new RandomForestClassifier({
      seed: 42,
      maxFeatures: 2,
      replacement: true,
      nEstimators: 50
    });
    this.isTrained = false;
    this.trainModel();
  }

  trainModel() {
    console.log('🤖 Initializing Machine Learning Fraud Detection Engine...');
    const trainingData = [];
    const labels = []; 

    for(let i = 0; i < 500; i++) {
        // Normal behavior: Travel speed normal, negligible weight loss
        const dist = Math.random() * 1000 + 50; 
        const expectedTime = dist / 60; 
        const actualTime = expectedTime + (Math.random() * 5 - 1); 
        const weightLoss = Math.random() * 0.9; 
        
        trainingData.push([dist, expectedTime, actualTime > 0 ? actualTime : 1, weightLoss]);
        labels.push(0);
    }

    for(let i = 0; i < 300; i++) {
        // Fraud Type A: Magical teleportation (delivered way too fast for physical limits)
        const dist = Math.random() * 1000 + 200; 
        const expectedTime = dist / 60; 
        const actualTime = expectedTime * (Math.random() * 0.4); 
        const weightLoss = Math.random() * 1.5; 
        
        trainingData.push([dist, expectedTime, actualTime > 0 ? actualTime : 0.1, weightLoss]);
        labels.push(1);
    }
    
    for(let i = 0; i < 200; i++) {
        // Fraud Type B: Product skimming (weight lost during transit exceeds organic spoilage limits)
        const dist = Math.random() * 800 + 100;
        const expectedTime = dist / 60;
        const actualTime = expectedTime + (Math.random() * 4);
        const weightLoss = (Math.random() * 5) + 2.0; 
        
        trainingData.push([dist, expectedTime, actualTime > 0 ? actualTime : 1, weightLoss]);
        labels.push(1);
    }

    this.model.train(trainingData, labels);
    this.isTrained = true;
    console.log('✅ Machine Learning model successfully trained on 1000 simulated historical data points.');
  }

  evaluateShipment(shipment) {
      if (!this.isTrained) return { isAnomaly: false };
      
      const distance = parseFloat(shipment.distance_km || 0);
      
      const expectedTimeStr = distance / 60; 
            
      // Derive actual transit duration in hours
      const actualTime = shipment.shipped_at && shipment.delivered_at 
            ? (new Date(shipment.delivered_at) - new Date(shipment.shipped_at)) / (1000 * 60 * 60)
            : expectedTimeStr;
            
      const originalWeight = parseFloat(shipment.original_weight || shipment.weight_kg);
      const finalWeight = parseFloat(shipment.delivered_weight || originalWeight);
      
      let weightLoss = 0;
      if (originalWeight > 0) {
          weightLoss = ((originalWeight - finalWeight) / originalWeight) * 100;
      }
      
      const features = [[distance, expectedTimeStr, actualTime, weightLoss]];
      const prediction = this.model.predict(features);
      
      return {
          isAnomaly: prediction[0] === 1,
          features: {
              distance_km: distance.toFixed(2),
              expected_hours: expectedTimeStr.toFixed(1),
              actual_hours: actualTime.toFixed(1),
              weight_loss_percent: weightLoss.toFixed(2)
          }
      };
  }
}

module.exports = new FraudMLEngine();
