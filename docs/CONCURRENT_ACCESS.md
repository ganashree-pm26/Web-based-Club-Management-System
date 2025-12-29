# Concurrent Access & Multi-User Support

## System Architecture for Multiple Users

This system is designed to handle multiple users accessing it simultaneously. Here's how it works:

### 1. **Database Connection Pooling**
- Uses MySQL connection pool (10 concurrent connections)
- Each user request gets its own database connection from the pool
- Connections are automatically managed and reused
- Prevents connection exhaustion with multiple users

### 2. **Session Isolation**
- Each user gets a unique session ID
- Sessions are stored in memory (default Express session store)
- User data is isolated per session
- No data leakage between users

### 3. **Concurrent Request Handling**
- Express.js handles multiple requests concurrently
- Each request is processed independently
- No blocking between users

### 4. **Real-time Updates**
- Auto-refresh on participant signup page (30 seconds)
- Manual refresh buttons available
- Database queries fetch latest data on each request

## Testing Concurrent Access

### Method 1: Multiple Browser Windows
1. Open multiple browser windows/tabs
2. Login as different users in each
3. All can access the system simultaneously

### Method 2: Different Devices
1. Access from different devices on the same network
2. Use `http://[YOUR_IP]:3000` instead of `localhost:3000`
3. Each device gets its own session

### Method 3: Different Browsers
1. Use Chrome, Firefox, Edge simultaneously
2. Each browser maintains separate sessions
3. Test with different user roles

## Configuration

### Connection Pool Settings (config/db.js)
```javascript
connectionLimit: 10  // Max 10 concurrent DB connections
queueLimit: 0        // Unlimited queued requests
```

### Session Settings (server.js)
```javascript
maxAge: 24 hours    // Session expires after 24 hours
httpOnly: true      // Secure cookie settings
```

## Best Practices for Production

1. **Use a proper session store** (Redis/MongoDB) for production
2. **Increase connection pool** if needed (currently 10)
3. **Add rate limiting** to prevent abuse
4. **Use HTTPS** in production
5. **Monitor connection pool usage**

## Current Limitations

- Sessions stored in memory (lost on server restart)
- Single server instance (no load balancing)
- Connection pool limit: 10 concurrent connections

## Scaling Options

For higher concurrency:
1. Increase `connectionLimit` in config/db.js
2. Use Redis for session storage
3. Add load balancer for multiple server instances
4. Use database read replicas

