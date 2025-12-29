// scripts/create_admin_user.js
const { createUser } = require("../utils/user");

(async ()=>{
  try {
    const id = await createUser({ username: "admin", password: "Admin@1234", role: "admin", linkedId: null, fullName: "Administrator" });
    console.log("Created admin user id:", id);
    process.exit(0);
  } catch (e) {
    console.error("Create admin failed:", e);
    process.exit(1);
  }
})();
