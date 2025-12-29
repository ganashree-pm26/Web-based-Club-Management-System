// scripts/reset_admin_password.js
const db = require("../config/db");
const bcrypt = require("bcrypt");

const newPassword = "Admin@1234"; // Set this to whatever password you want

(async () => {
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE users SET Password = ? WHERE Username = 'admin' AND Role = 'admin'",
        [hash],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });
    
    console.log(`✅ Admin password reset successfully!`);
    console.log(`Username: admin`);
    console.log(`Password: ${newPassword}`);
    console.log(`Role: admin`);
    process.exit(0);
  } catch (e) {
    console.error("Reset password failed:", e);
    process.exit(1);
  }
})();

