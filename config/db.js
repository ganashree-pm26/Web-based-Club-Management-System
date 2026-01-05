const mysql = require('mysql2');

// Use connection pool for concurrent access
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "Gana@2006",
    database: "clubms",
    waitForConnections: true,
    connectionLimit: 10, // Maximum number of connections in the pool
    queueLimit: 0, // Unlimited queue
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test the connection
db.getConnection((err, connection) => {
    if (err) {
        console.error("MySQL Connection Error:", err);
        throw err;
    }
    console.log("MySQL Connected with Connection Pool!");
    connection.release(); // Release the connection back to the pool
});

module.exports = db;