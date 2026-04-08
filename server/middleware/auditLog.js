const pool = require('../database/db');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        let entityId = null;
        if (data && data.id) {
          entityId = data.id;
        } else if (req.params && req.params.id) {
          entityId = req.params.id;
        } else if (data && typeof data === 'object') {
            // Try to find the entity ID by the entityType key
            if (data[entityType] && data[entityType].id) {
              entityId = data[entityType].id;
            } else {
              // Iterate to find any sub-object with an id
              for (const key in data) {
                if (data[key] && typeof data[key] === 'object' && data[key].id) {
                  entityId = data[key].id;
                  break;
                }
              }
            }
        }
        
        if (global.activityLogger) {
          const userIdent = req.user ? `User ID ${req.user.id} (${req.user.role})` : 'Unknown User';
          global.activityLogger.info(`${userIdent} performed ${action} on ${entityType} (Entity ID: ${entityId || 'N/A'})`);
        }
        
        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            req.user?.id || null,
            action || null,
            entityType || null,
            entityId || null,
            JSON.stringify({
              method: req.method,
              path: req.path,
              body: req.body,
              query: req.query
            }),
            req.ip || null,
            req.get('user-agent') || null
          ]
        ).catch(err => console.error('Audit log error:', err));
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

module.exports = auditLog;
