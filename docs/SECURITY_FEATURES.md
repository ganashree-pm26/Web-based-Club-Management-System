# Security Features Documentation

This document provides a comprehensive list of all security features implemented in the Web-Based Club Management System.

---

## 1. Authentication & Password Security

### 1.1 Password Hashing
- **Technology**: bcrypt (bcrypt and bcryptjs)
- **Salt Rounds**: 
  - 12 rounds for user creation (`utils/user.js`)
  - 10 rounds for password hashing utilities (`hash.js`)
- **Implementation**: All passwords are hashed before storage in the database
- **Location**: `utils/user.js`, `hash.js`, `scripts/reset_admin_password.js`

### 1.2 Login Authentication
- **Multi-factor verification**: Username, password, and role must all match
- **Credential validation**: 
  - Checks if user exists
  - Validates password using bcrypt.compare()
  - Verifies role matches the selected role
- **Generic error messages**: "Invalid credentials" prevents username enumeration
- **Location**: `routes/auth.js` (lines 18-52)

### 1.3 Session-Based Authentication
- **Session creation**: User session created only after successful authentication
- **Session data stored**: UserID, username, role, linkedId, name
- **Location**: `routes/auth.js` (lines 34-40)

---

## 2. Authorization & Access Control

### 2.1 Role-Based Access Control (RBAC)
- **Five user roles**: admin, coordinator, member, sponsor, participant
- **Role middleware**: `middleware/role.js` provides reusable role-checking functions
- **Individual role helpers**: isAdmin, isCoordinator, isMember, isSponsor, isParticipant
- **Array support**: Can check multiple roles using array parameter
- **Location**: `middleware/role.js`

### 2.2 Route Protection
- **Middleware-based protection**: All protected routes use authentication/authorization middleware
- **Admin-only routes**: Protected with `isAdmin` middleware
- **Coordinator routes**: Protected with `isCoordinator` middleware
- **Multi-role authorization**: Some routes allow multiple roles (e.g., admin OR coordinator)
- **Event-specific authorization**: Coordinators can only access events they're assigned to
- **Location**: Various route files (`routes/admin.js`, `routes/coordinator.js`, etc.)

### 2.3 Authorization Patterns
- **Session check**: All middleware checks for active session first
- **Role verification**: Compares user role with required role(s)
- **Access denied**: Returns 403 Forbidden or redirects to login
- **Event coordinator authorization**: `authorizeEventCoordinator()` function in `routes/participants.js`
- **Event access check**: `checkEventAccess()` function in `routes/coordinator.js`

---

## 3. SQL Injection Prevention

### 3.1 Parameterized Queries
- **Technology**: mysql2 with parameterized queries
- **Pattern**: All user input is passed as parameters using `?` placeholders
- **Implementation**: `db.query(sql, [param1, param2, ...])` pattern used throughout
- **Examples**: 
  - User lookup: `"SELECT * FROM users WHERE Username = ?", [username]`
  - Event queries: `"SELECT * FROM event WHERE EventID = ?", [eventId]`
- **Coverage**: 76+ parameterized queries across 9 route files
- **Location**: All route files using database queries

### 3.2 No String Concatenation
- **Safe query construction**: SQL queries do not use string concatenation with user input
- **Parameter binding**: All dynamic values are passed as query parameters

---

## 4. Session Security

### 4.1 Session Configuration
- **Technology**: express-session
- **Session secret**: Custom secret key for session signing
- **Cookie settings**:
  - `httpOnly: true` - Prevents JavaScript access to cookies
  - `secure: false` - Should be `true` in production with HTTPS
  - `maxAge: 24 * 60 * 60 * 1000` - 24-hour session expiration
  - `name: 'clubms.sid'` - Custom session cookie name
- **Session options**:
  - `resave: false` - Prevents session resave on every request
  - `saveUninitialized: false` - Only saves initialized sessions
- **Location**: `server.js` (lines 17-27)

### 4.2 Session Management
- **Session creation**: Only after successful authentication
- **Session destruction**: Proper logout with `req.session.destroy()`
- **Session isolation**: Each user gets unique session ID
- **Session checking**: All protected routes verify session exists
- **Location**: `routes/auth.js` (logout: lines 55-63)

---

## 5. Input Validation

### 5.1 Required Field Validation
- **Login validation**: Checks username, password, and role are provided
- **Signup validation**: Validates name, email, eventId, and password
- **Password confirmation**: Checks password and confirmPassword match
- **Error messages**: User-friendly validation error messages
- **Location**: `routes/auth.js`, `routes/participants.js`

### 5.2 Data Type Validation
- **Number conversion**: Event IDs and user IDs are converted to numbers where needed
- **Role normalization**: Role comparisons use `.toLowerCase().trim()` for consistency
- **Date handling**: Proper date object creation and handling

---

## 6. Error Handling & Information Disclosure Prevention

### 6.1 Generic Error Messages
- **Login errors**: "Invalid credentials" instead of specific failure reasons
- **Server errors**: "Server error" or "Database error" instead of stack traces
- **Exception handling**: Try-catch blocks prevent unhandled exceptions
- **Location**: `routes/auth.js`, various route handlers

### 6.2 Error Logging
- **Server-side logging**: Errors logged to console for debugging
- **No client exposure**: Detailed error information not sent to client
- **Error pages**: Custom error pages for user-facing errors
- **Location**: Error handling throughout route files

---

## 7. Database Security

### 7.1 Connection Pooling
- **Technology**: mysql2 connection pool
- **Configuration**:
  - `connectionLimit: 10` - Maximum concurrent connections
  - `waitForConnections: true` - Wait for available connections
  - `queueLimit: 0` - Unlimited queue (consider limiting in production)
  - `enableKeepAlive: true` - Keep connections alive
- **Benefits**: Prevents connection exhaustion, improves security
- **Location**: `config/db.js`

### 7.2 Database Credentials
- **Storage**: Credentials stored in configuration file
- **Recommendation**: Should use environment variables in production
- **Location**: `config/db.js`

---

## 8. Concurrent Access & Session Isolation

### 8.1 Multi-User Support
- **Session isolation**: Each user gets unique session
- **Concurrent handling**: Express.js handles multiple requests concurrently
- **No data leakage**: User data isolated per session
- **Connection pooling**: Supports multiple simultaneous database connections
- **Location**: `docs/CONCURRENT_ACCESS.md`, `config/db.js`, `server.js`

---

## 9. Password Management

### 9.1 Password Reset Utilities
- **Script**: `scripts/reset_admin_password.js`
- **Secure hashing**: Uses bcrypt with 12 salt rounds
- **Secure storage**: Hashed passwords stored in database

### 9.2 User Creation Security
- **Hashed passwords**: All new user passwords are hashed
- **Secure defaults**: Generated passwords for coordinators
- **Location**: `utils/user.js` (createUser function)

---

## 10. Route-Level Security Patterns

### 10.1 Protected Route Patterns
- **Pattern 1**: Inline middleware functions (e.g., `isAdmin` in `routes/admin.js`)
- **Pattern 2**: Imported middleware (e.g., `requireRole` from `middleware/role.js`)
- **Pattern 3**: Custom authorization functions (e.g., `authorizeEventCoordinator`)
- **Pattern 4**: Multi-role middleware (e.g., `isAdminOrCoordinator`)

### 10.2 Authentication Checks
- **Session verification**: `if(!req.session || !req.session.user)`
- **Role verification**: Role comparison before route access
- **Event authorization**: Additional checks for event-specific access
- **Location**: All protected route files

---

## 11. Security Best Practices Implemented

✅ **Password Hashing**: bcrypt with appropriate salt rounds  
✅ **SQL Injection Prevention**: Parameterized queries throughout  
✅ **Session Security**: httpOnly cookies, session expiration  
✅ **Role-Based Access Control**: Comprehensive RBAC implementation  
✅ **Input Validation**: Required field and format validation  
✅ **Error Handling**: Generic error messages prevent information disclosure  
✅ **Session Management**: Proper creation and destruction  
✅ **Authentication**: Multi-factor login verification  
✅ **Authorization**: Route-level and resource-level authorization  
✅ **Connection Pooling**: Secure database connection management  

---

## 12. Security Recommendations for Production

⚠️ **Environment Variables**: Move database credentials to environment variables  
⚠️ **HTTPS**: Enable `secure: true` in session cookie configuration  
⚠️ **CSRF Protection**: Consider adding CSRF tokens for state-changing operations  
⚠️ **Rate Limiting**: Implement rate limiting for login attempts  
⚠️ **Session Store**: Use Redis or database-backed session store instead of memory  
⚠️ **Helmet.js**: Add security headers using Helmet middleware  
⚠️ **Input Sanitization**: Add input sanitization library (e.g., validator.js)  
⚠️ **Password Policy**: Enforce strong password requirements  
⚠️ **Audit Logging**: Implement audit logs for sensitive operations  
⚠️ **SQL Injection Testing**: Regular security audits and penetration testing  

---

## Files Referenced

- `routes/auth.js` - Authentication logic
- `middleware/role.js` - Role-based access control
- `utils/user.js` - User management with password hashing
- `server.js` - Session configuration
- `config/db.js` - Database connection pooling
- `routes/admin.js` - Admin route protection
- `routes/coordinator.js` - Coordinator route protection
- `routes/participants.js` - Participant routes with authorization
- `routes/sponsors.js` - Sponsor route protection
- `routes/feedbackAnalysis.js` - Feedback analysis authorization
- All other route files with protected endpoints

---

*Last Updated: Based on codebase analysis*
*Documentation Version: 1.0*

