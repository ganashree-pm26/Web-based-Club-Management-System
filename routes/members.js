const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isMember } = require("../middleware/role");

// Dashboard for logged-in member
router.get("/dashboard", isMember, (req, res) => {
  const memberId = req.session.user.linkedId;
  const sql = `
    SELECT t.TaskID, t.TaskName, t.Description, t.Status, t.Deadline,
     e.EventName, e.EventDate, e.Venue, m.MemberName
    FROM task t
    JOIN event e ON t.EventID = e.EventID
    LEFT JOIN member m ON t.AssignedTo = m.MemberID
    WHERE t.AssignedTo = ?
    ORDER BY t.Deadline;
  `;
  db.query(sql, [memberId], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    
    // Get member info
    db.query("SELECT * FROM member WHERE MemberID = ?", [memberId], (err2, memberRows) => {
      if (err2) return res.status(500).send("DB error");
      const member = memberRows[0] || {};
      
      res.render("members/tasks", { 
        tasks: rows, 
        memberId,
        member,
        user: req.session.user
      });
    });
  });
});

// Member view: tasks for a member by id (optional direct link - requires member auth)
router.get("/tasks/:memberId", isMember, (req, res) => {
  const memberId = req.params.memberId;
  // Ensure member can only view their own tasks
  if (req.session.user.linkedId != memberId) {
    return res.status(403).send("Access denied");
  }
  
  const sql = `
    SELECT t.TaskID, t.TaskName, t.Description, t.Status, t.Deadline, e.EventName, e.EventDate, e.Venue, m.MemberName
    FROM task t
    JOIN event e ON t.EventID = e.EventID
    LEFT JOIN member m ON t.AssignedTo = m.MemberID
    WHERE t.AssignedTo = ?
    ORDER BY t.Deadline;
  `;
  db.query(sql, [memberId], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    
    // Get member info
    db.query("SELECT * FROM member WHERE MemberID = ?", [memberId], (err2, memberRows) => {
      if (err2) return res.status(500).send("DB error");
      const member = memberRows[0] || {};
      
      res.render("members/tasks", { 
        tasks: rows, 
        memberId,
        member,
        user: req.session.user
      });
    });
  });
});

// Member updates task status (POST)
router.post("/tasks/:taskId/status", isMember, (req, res) => {
  const taskId = req.params.taskId;
  const { status } = req.body;
  db.query("UPDATE task SET Status=? WHERE TaskID=?", [status, taskId], (err) => {
    if (err) return res.status(500).send("DB error");
    res.redirect("/members/dashboard");
  });
});

module.exports = router;
