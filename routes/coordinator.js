const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isCoordinator } = require("../middleware/role");

// Helper: Check if coordinator is assigned to event
function checkEventAccess(req, eventId, callback) {
  const memberId = req.session.user.linkedId;
  db.query(
    "SELECT 1 FROM coordinates WHERE EventID = ? AND MemberID = ?",
    [eventId, memberId],
    (err, rows) => {
      if (err) return callback(false);
      callback(rows.length > 0);
    }
  );
}

// Coordinator dashboard: show events they coordinate
router.get("/dashboard", isCoordinator, (req, res) => {
  const memberId = req.session.user.linkedId;
  const sql = `
    SELECT e.EventID, e.EventName, e.EventDate, e.Venue,
           COUNT(DISTINCT p.ParticipantID) AS totalParticipants,
           COUNT(DISTINCT t.TaskID) AS totalTasks,
           COALESCE(SUM(b.AllocatedAmount), 0) AS totalBudget,
           COALESCE(SUM(ex.Amount), 0) AS totalSpent
    FROM coordinates c
    JOIN event e ON c.EventID = e.EventID
    LEFT JOIN participant p ON p.EventID = e.EventID
    LEFT JOIN task t ON t.EventID = e.EventID
    LEFT JOIN budget b ON b.EventID = e.EventID
    LEFT JOIN expenditure ex ON ex.EventID = e.EventID
    WHERE c.MemberID = ?
    GROUP BY e.EventID, e.EventName, e.EventDate, e.Venue
    ORDER BY e.EventDate;
  `;
  db.query(sql, [memberId], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.render("coordinator/dashboard", { events: rows, user: req.session.user });
  });
});

// Manage Participants for an event
router.get("/events/:eventId/participants", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  const memberId = req.session.user.linkedId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `
      SELECT p.*, e.EventName
      FROM participant p
      JOIN event e ON p.EventID = e.EventID
      WHERE p.EventID = ?
      ORDER BY p.ParticipantName;
    `;
    db.query(sql, [eventId], (err, participants) => {
      if (err) return res.status(500).send("DB error");
      db.query("SELECT EventID, EventName FROM event WHERE EventID = ?", [eventId], (err2, eventRows) => {
        if (err2) return res.status(500).send("DB error");
        res.render("coordinator/participants", { 
          participants, 
          event: eventRows[0],
          user: req.session.user 
        });
      });
    });
  });
});

// Manage Tasks for an event
router.get("/events/:eventId/tasks", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `
      SELECT t.*, e.EventName, m.MemberName, m.MemberID
      FROM task t
      JOIN event e ON t.EventID = e.EventID
      LEFT JOIN member m ON t.AssignedTo = m.MemberID
      WHERE t.EventID = ?
      ORDER BY t.Deadline;
    `;
    db.query(sql, [eventId], (err, tasks) => {
      if (err) return res.status(500).send("DB error");
      db.query("SELECT * FROM member", (err2, members) => {
        if (err2) return res.status(500).send("DB error");
        db.query("SELECT EventID, EventName FROM event WHERE EventID = ?", [eventId], (err3, eventRows) => {
          if (err3) return res.status(500).send("DB error");
          res.render("coordinator/tasks", { 
            tasks, 
            members, 
            event: eventRows[0],
            user: req.session.user 
          });
        });
      });
    });
  });
});

// Create Task
router.post("/events/:eventId/tasks/create", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  const { taskName, description, deadline, assignedTo } = req.body;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `INSERT INTO task (EventID, TaskName, Description, Deadline, AssignedTo, Status) 
                 VALUES (?, ?, ?, ?, ?, 'Pending')`;
    db.query(sql, [eventId, taskName, description, deadline || null, assignedTo || null], (err) => {
      if (err) return res.status(500).send("Create failed");
      res.redirect(`/coordinator/events/${eventId}/tasks`);
    });
  });
});

// Update Task
router.post("/events/:eventId/tasks/:taskId/update", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  const taskId = req.params.taskId;
  const { taskName, description, deadline, assignedTo, status } = req.body;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `UPDATE task SET TaskName=?, Description=?, Deadline=?, AssignedTo=?, Status=? 
                 WHERE TaskID=? AND EventID=?`;
    db.query(sql, [taskName, description, deadline || null, assignedTo || null, status, taskId, eventId], (err) => {
      if (err) return res.status(500).send("Update failed");
      res.redirect(`/coordinator/events/${eventId}/tasks`);
    });
  });
});

// Delete Task
router.get("/events/:eventId/tasks/:taskId/delete", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  const taskId = req.params.taskId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    db.query("DELETE FROM task WHERE TaskID=? AND EventID=?", [taskId, eventId], (err) => {
      if (err) return res.status(500).send("Delete failed");
      res.redirect(`/coordinator/events/${eventId}/tasks`);
    });
  });
});

// View Members for an event
router.get("/events/:eventId/members", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `
      SELECT DISTINCT m.*, COUNT(DISTINCT t.TaskID) AS taskCount
      FROM member m
      JOIN task t ON t.AssignedTo = m.MemberID
      WHERE t.EventID = ?
      GROUP BY m.MemberID
      UNION
      SELECT m.*, 0 AS taskCount
      FROM member m
      JOIN coordinates c ON c.MemberID = m.MemberID
      WHERE c.EventID = ?
      AND m.MemberID NOT IN (SELECT DISTINCT AssignedTo FROM task WHERE EventID = ? AND AssignedTo IS NOT NULL)
    `;
    db.query(sql, [eventId, eventId, eventId], (err, members) => {
      if (err) return res.status(500).send("DB error");
      db.query("SELECT EventID, EventName FROM event WHERE EventID = ?", [eventId], (err2, eventRows) => {
        if (err2) return res.status(500).send("DB error");
        res.render("coordinator/members", { 
          members, 
          event: eventRows[0],
          user: req.session.user 
        });
      });
    });
  });
});

// View Budget for an event
router.get("/events/:eventId/budget", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const sql = `
      SELECT b.*, 
             (SELECT COALESCE(SUM(Amount), 0) FROM expenditure e WHERE e.EventID = b.EventID AND e.Category = b.Category) AS Spent
      FROM budget b
      WHERE b.EventID = ?
    `;
    db.query(sql, [eventId], (err, budgets) => {
      if (err) return res.status(500).send("DB error");
      db.query("SELECT * FROM expenditure WHERE EventID = ? ORDER BY ExpenseDate DESC", [eventId], (err2, expenditures) => {
        if (err2) return res.status(500).send("DB error");
        db.query("SELECT EventID, EventName FROM event WHERE EventID = ?", [eventId], (err3, eventRows) => {
          if (err3) return res.status(500).send("DB error");
          res.render("coordinator/budget", { 
            budgets, 
            expenditures,
            event: eventRows[0],
            user: req.session.user 
          });
        });
      });
    });
  });
});

// Add expenditure for an event
router.post("/events/:eventId/expenditure/create", isCoordinator, (req, res) => {
  const eventId = req.params.eventId;
  
  checkEventAccess(req, eventId, (hasAccess) => {
    if (!hasAccess) return res.status(403).send("Access denied");
    
    const { category, amount, date, description } = req.body;
    
    // Validate inputs
    if (!category || !amount || !date) {
      return res.status(400).send("Category, amount, and date are required");
    }
    
    // Check if the category exists in the budget
    const checkCategorySql = "SELECT * FROM budget WHERE EventID = ? AND Category = ?";
    db.query(checkCategorySql, [eventId, category], (err, budgetRows) => {
      if (err) return res.status(500).send("DB error");
      if (budgetRows.length === 0) {
        return res.status(400).send("Invalid category for this event");
      }
      
      // Insert the expenditure
      const insertSql = `INSERT INTO expenditure (EventID, Category, Amount, ExpenseDate, Description) 
                       VALUES (?, ?, ?, ?, ?)`;
      
      db.query(insertSql, [eventId, category, amount, date, description || ''], (err) => {
        if (err) return res.status(500).send("Insert error: " + err.message);
        res.redirect(`/coordinator/events/${eventId}/budget`);
      });
    });
  });
});

module.exports = router;
