const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAdmin } = require("./admin").isAdmin ? require("./admin") : require("../routes/admin");

// --- LIST ALL EVENTS ---
router.get("/", isAdmin, (req, res) => {
    const q = "SELECT * FROM event ORDER BY EventDate DESC";
    db.query(q, (err, events) => {
        if (err) return res.send("DB Error");
        res.render("events/list", { events });
    });
});

// --- SHOW CREATE FORM ---
router.get("/create", isAdmin, (req, res) => {
    db.query("SELECT * FROM club", (err, clubs) => {
        if (err) return res.send("DB Error");
        res.render("events/create", { clubs });
    });
});

// --- HANDLE CREATE ---
router.post("/create", isAdmin, (req, res) => {
    const { EventName, EventDate, Venue, ClubID, Budget } = req.body;

    const q = `INSERT INTO event (EventName, EventDate, Venue, ClubID, Budget)
               VALUES (?, ?, ?, ?, ?)`;

    db.query(q, [EventName, EventDate, Venue, ClubID, Budget], (err) => {
        if (err) return res.send("Insert Error");
        res.redirect("/events");
    });
});

// --- SHOW EDIT FORM ---
router.get("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;

    db.query("SELECT * FROM event WHERE EventID = ?", [id], (err, result) => {
        if (err || result.length === 0) return res.send("Event not found");
        
        db.query("SELECT * FROM club", (err2, clubs) => {
            if (err2) return res.send("DB Error");
            res.render("events/edit", { event: result[0], clubs });
        });
    });
});

// --- HANDLE UPDATE ---
router.post("/edit/:id", isAdmin, (req, res) => {
    const id = req.params.id;
    const { EventName, EventDate, Venue, ClubID, Budget } = req.body;

    const q = `UPDATE event 
               SET EventName=?, EventDate=?, Venue=?, ClubID=?, Budget=? 
               WHERE EventID=?`;

    db.query(q, [EventName, EventDate, Venue, ClubID, Budget, id], (err) => {
        if (err) return res.send("Update Error");
        res.redirect("/events");
    });
});

// --- DELETE EVENT ---
router.get("/delete/:id", isAdmin, (req, res) => {
    const id = req.params.id;
    
    // Start a transaction to ensure data consistency
    db.getConnection((err, connection) => {
        if (err) return res.send("DB Connection Error");
        
        connection.beginTransaction((err) => {
            if (err) {
                connection.release();
                return res.send("Transaction Error");
            }
            
            // Delete related records in the correct order to respect foreign key constraints
            const queries = [
                "DELETE FROM task WHERE EventID = ?",
                "DELETE FROM coordinates WHERE EventID = ?",
                "DELETE FROM participant WHERE EventID = ?",
                "DELETE FROM sponsor WHERE EventID = ?",
                "DELETE FROM expenditure WHERE EventID = ?",
                "DELETE FROM budget WHERE EventID = ?",
                "DELETE FROM event WHERE EventID = ?"
            ];
            
            let queryIndex = 0;
            
            function executeNextQuery() {
                if (queryIndex < queries.length) {
                    const query = queries[queryIndex];
                    connection.query(query, [id], (err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error("Delete error:", err);
                                return res.send("Delete Error: " + err.message);
                            });
                        }
                        queryIndex++;
                        executeNextQuery();
                    });
                } else {
                    // All queries executed successfully
                    connection.commit((err) => {
                        connection.release();
                        if (err) {
                            return res.send("Commit Error");
                        }
                        res.redirect("/events");
                    });
                }
            }
            
            executeNextQuery();
        });
    });
});

module.exports = router;
