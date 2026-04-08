const pool = require('../database/db');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = data.id || req.params.id || null;
        
        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            req.user?.id || null,
            action,
            entityType,
            entityId,
            JSON.stringify({
              method: req.method,
              path: req.path,
              body: req.body,
              query: req.query
            }),
            req.ip,
            req.get('user-agent')
          ]
        ).catch(err => console.error('Audit log error:', err));
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

module.exports = auditLog;
