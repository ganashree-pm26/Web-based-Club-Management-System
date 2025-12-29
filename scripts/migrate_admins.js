const db = require("../config/db");
const bcrypt = require("bcrypt");

(async ()=>{
  try {
    const [admins] = await new Promise((res,rej)=> db.query("SELECT * FROM admin", (e,r)=> e?rej(e):res([r])));
    for(const a of admins){
      const hashed = await bcrypt.hash(a.Password, 10);
      await new Promise((res,rej)=> db.query(
        "INSERT IGNORE INTO users (Username, Password, Role, LinkedID, FullName) VALUES (?, ?, 'admin', ?, ?)",
        [a.Username, hashed, a.AdminID, a.Username],
        (e)=> e?rej(e):res()
      ));
      console.log("Migrated admin", a.Username);
    }
    console.log("Done");
    process.exit(0);
  } catch(err){
    console.error(err);
    process.exit(1);
  }
})();
