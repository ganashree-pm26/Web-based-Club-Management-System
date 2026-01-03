const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { findUserByUsername } = require("../utils/user");

router.get("/login", (req, res) => {
  if(req.session && req.session.user){
    const r = req.session.user.role;
    if(r === "admin") return res.redirect("/admin/dashboard");
    if(r === "coordinator") return res.redirect("/coordinator/dashboard");
    if(r === "member") return res.redirect("/members/dashboard");
    if(r === "sponsor") return res.redirect("/sponsors/dashboard");
    if(r === "participant") return res.redirect("/participants/dashboard");
  }
  res.render("auth/login", { error: null });
});

router.post("/login", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if(!username || !password || !role) 
        return res.render("auth/login", { error: "Fill all fields" });

    const user = await findUserByUsername(username);
    if(!user) return res.render("auth/login", { error: "Invalid credentials" });

    if (!user.Role || user.Role.trim().toLowerCase() !== role.trim().toLowerCase()) {
        return res.render("auth/login", { error: "Role mismatch" });
    }

    const ok = await bcrypt.compare(password, user.Password);
    if(!ok) return res.render("auth/login", { error: "Invalid credentials" });

    req.session.user = {
      userId: user.UserID,
      username: user.Username,
      role: user.Role,
      linkedId: user.LinkedID,
      name: user.FullName
    };

    if(user.Role === "admin") return res.redirect("/admin/dashboard");
    if(user.Role === "coordinator") return res.redirect("/coordinator/dashboard");
    if(user.Role === "member") return res.redirect("/members/dashboard");
    if(user.Role === "sponsor") return res.redirect("/sponsors/dashboard");
    if(user.Role === "participant") return res.redirect("/participants/dashboard");

  } catch (err) {
    console.error("Auth error:", err);
    res.render("auth/login", { error: "Server error" });
  }
});


router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/login");
    }
    res.redirect("/login");
  });
});

module.exports = router;
