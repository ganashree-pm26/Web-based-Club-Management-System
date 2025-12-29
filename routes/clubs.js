const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAdmin } = require("./admin").isAdmin ? require("./admin") : require("../routes/admin");

// List all clubs
router.get("/", isAdmin, (req, res) => {
    const q = "SELECT * FROM club ORDER BY ClubName";
    db.query(q, (err, clubs) => {
        if (err) return res.send("DB Error");
        res.render("clubs/list", { clubs, user: req.session.user });
    });
});

// Show create form
router.get("/create", isAdmin, (req, res) => {
    res.render("clubs/create", { user: req.session.user });
});

// Handle create
router.post("/create", isAdmin, (req, res) => {
    const { ClubName, Description } = req.body;

    const q = `INSERT INTO club (ClubName, Description)
               VALUES (?, ?)`;

    db.query(q, [ClubName, Description], (err) => {
        if (err) return res.send("Insert Error: " + err.message);
        res.redirect("/clubs");
    });
});

// Show edit form
router.get("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;

    db.query("SELECT * FROM club WHERE ClubID = ?", [id], (err, result) => {
        if (err || result.length === 0) return res.send("Club not found");
        res.render("clubs/edit", { club: result[0], user: req.session.user });
    });
});

// Handle update
router.post("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;
    const { ClubName, Description } = req.body;

    const q = `UPDATE club 
               SET ClubName=?, Description=? 
               WHERE ClubID=?`;

    db.query(q, [ClubName, Description, id], (err) => {
        if (err) return res.send("Update Error: " + err.message);
        res.redirect("/clubs");
    });
});

// Delete club
router.get("/delete/:id", isAdmin, (req, res) => {
    const id = req.params.id;

    db.query("DELETE FROM club WHERE ClubID=?", [id], (err) => {
        if (err) return res.send("Delete Error: " + err.message);
        res.redirect("/clubs");
    });
});

module.exports = router;