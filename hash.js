const bcrypt = require("bcryptjs");

const password = "Admin@123";

bcrypt.hash(password, 10, (err, hash) => {
    if (err) throw err;
    console.log("HASH: ", hash);
});
