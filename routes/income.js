const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAdmin } = require("./admin").isAdmin ? require("./admin") : require("../routes/admin");

// List all income
router.get("/", isAdmin, (req, res) => {
    const sql = `
        SELECT i.*, e.EventName, 
               CASE 
                 WHEN i.SourceType = 'participant' THEN p.ParticipantName
                 WHEN i.SourceType = 'sponsor' THEN s.SponsorName
                 ELSE 'Other'
               END as SourceName
        FROM income i
        LEFT JOIN event e ON i.EventID = e.EventID
        LEFT JOIN participant p ON (i.SourceType = 'participant' AND i.SourceID = p.ParticipantID)
        LEFT JOIN sponsor s ON (i.SourceType = 'sponsor' AND i.SourceID = s.SponsorID)
        ORDER BY i.IncomeDate DESC, i.IncomeID DESC
    `;
    
    db.query(sql, (err, income) => {
        if (err) return res.status(500).send("DB Error: " + err.message);
        res.render("income/list", { income, user: req.session.user });
    });
});

// Show create form
router.get("/create", isAdmin, (req, res) => {
    // Get events for the dropdown
    db.query("SELECT EventID, EventName FROM event ORDER BY EventName", (err, events) => {
        if (err) return res.status(500).send("DB Error: " + err.message);
        res.render("income/create", { events, user: req.session.user });
    });
});

// Handle create
router.post("/create", isAdmin, (req, res) => {
    const { EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description } = req.body;

    const sql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description], (err) => {
        if (err) return res.status(500).send("Insert Error: " + err.message);
        res.redirect("/income");
    });
});

// Show edit form
router.get("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;

    // Get the income record
    db.query("SELECT * FROM income WHERE IncomeID = ?", [id], (err, result) => {
        if (err || result.length === 0) return res.status(404).send("Income record not found");
        
        // Get events for the dropdown
        db.query("SELECT EventID, EventName FROM event ORDER BY EventName", (err2, events) => {
            if (err2) return res.status(500).send("DB Error: " + err2.message);
            res.render("income/edit", { income: result[0], events, user: req.session.user });
        });
    });
});

// Handle update
router.post("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;
    const { EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description } = req.body;

    const sql = `UPDATE income 
                 SET EventID=?, SourceType=?, SourceID=?, Category=?, Amount=?, IncomeDate=?, Description=? 
                 WHERE IncomeID=?`;

    db.query(sql, [EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description, id], (err) => {
        if (err) return res.status(500).send("Update Error: " + err.message);
        res.redirect("/income");
    });
});

// Delete income
router.get("/delete/:id", isAdmin, (req, res) => {
    const id = req.params.id;

    db.query("DELETE FROM income WHERE IncomeID=?", [id], (err) => {
        if (err) return res.status(500).send("Delete Error: " + err.message);
        res.redirect("/income");
    });
});

module.exports = router;