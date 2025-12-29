const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require("path");

const app = express();

// Database connections
require('./config/db');      
require('./config/mongo');   

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions (must be before routes) - configured for concurrent access
app.use(session({
    secret: "GanashreeSecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true, // Prevents client-side JavaScript access
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'clubms.sid' // Custom session name
}));

// CORS
app.use(cors());

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
console.log("Views Folder Path = ", path.join(__dirname, "views"));

// ROUTES (ORDER MATTERS!)

// 1️⃣ Auth FIRST
app.use("/", require("./routes/auth"));

const adminRoutes = require("./routes/admin").router;
app.use("/admin", adminRoutes);

app.use("/coordinator", require("./routes/coordinator"));
app.use("/members", require("./routes/members"));
app.use("/participants", require("./routes/participants"));
app.use("/feedback", require("./routes/feedback"));
app.use("/sponsors", require("./routes/sponsors"));
app.use("/events", require("./routes/events"));
app.use("/clubs", require("./routes/clubs"));
app.use("/feedback-analysis", require("./routes/feedbackAnalysis"));
app.use("/income", require("./routes/income"));

// Root landing page
app.get("/", (req, res) => {
    res.render("index", { user: req.session?.user || null });
});

// Start Server
const PORT = 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log("=".repeat(60));
    console.log("🚀 Club Management System Server Started!");
    console.log("=".repeat(60));
    console.log(`📍 Local Access:    http://localhost:${PORT}`);
    console.log(`📍 Local Access:    http://127.0.0.1:${PORT}`);
    
    // Get network IP addresses
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    
    console.log("\n🌐 Network Access (for other devices):");
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`   http://${iface.address}:${PORT}`);
            }
        });
    });
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Server is ready to handle concurrent requests!");
    console.log("=".repeat(60));
});
