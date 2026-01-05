const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { requireRole } = require("../middleware/role");

// Middleware: allow admin OR coordinator
function isAdminOrCoordinator(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/login");
  const role = req.session.user.role;
  if (role === "admin" || role === "coordinator") return next();
  return res.status(403).send("Forbidden");
}

// Utility: allow admin or coordinator assigned to the event
function authorizeEventCoordinator(req, eventId, onOk, onFail) {
  if (req.session?.user?.role === "admin") return onOk();
  const memberId = req.session?.user?.linkedId || req.session?.user?.LinkedID;
  if (!memberId || req.session?.user?.role !== "coordinator") {
    return onFail();
  }
  db.query(
    "SELECT 1 FROM coordinates WHERE EventID = ? AND MemberID = ? LIMIT 1",
    [eventId, memberId],
    (err, rows) => {
      if (err) return onFail(err);
      if (rows.length) return onOk();
      return onFail();
    }
  );
}

// Participant dashboard: show registrations for logged-in participant
router.get("/dashboard", require("../middleware/role").isParticipant, (req, res) => {
  const participantId = req.session.user.linkedId;
  const sql = `
    SELECT p.*, e.EventName, e.EventDate, e.Venue, e.EventID
    FROM participant p
    JOIN event e ON p.EventID = e.EventID
    WHERE p.ParticipantID = ?
    ORDER BY e.EventDate;
  `;
  db.query(sql, [participantId], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    
    if (rows.length === 0) {
      return res.render("participants/dashboard", {
        participant: null,
        registrations: [],
        user: req.session.user
      });
    }
    
    const participant = {
      ParticipantID: rows[0].ParticipantID,
      ParticipantName: rows[0].ParticipantName,
      Email: rows[0].Email,
      Phone: rows[0].Phone
    };
    
    res.render("participants/dashboard", {
      participant,
      registrations: rows,
      user: req.session.user
    });
  });
});

// LIST with filters (event, team, pay status, attendance)
router.get("/list", isAdminOrCoordinator, (req, res) => {
  const { eventId, teamId, payStatus, attendanceStatus } = req.query;
  const conditions = [];
  const params = [];
  if (eventId) {
    conditions.push("p.EventID = ?");
    params.push(eventId);
  }
  if (teamId) {
    conditions.push("p.TeamID = ?");
    params.push(teamId);
  }
  if (payStatus) {
    conditions.push("p.PayStatus = ?");
    params.push(payStatus);
  }
  if (attendanceStatus) {
    conditions.push("p.AttendanceStatus = ?");
    params.push(attendanceStatus);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT p.ParticipantID, p.ParticipantName, p.Email, p.Phone, p.TeamID, p.TeamName,
           p.PayStatus, p.AmountPaid, p.RegDate, p.AttendanceStatus,
           e.EventID, e.EventName
    FROM participant p
    JOIN event e ON p.EventID = e.EventID
    ${where}
    ORDER BY e.EventID, p.TeamID, p.ParticipantName;
  `;
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).send("DB error");
    db.query("SELECT EventID, EventName FROM event", (err2, events) => {
      if (err2) return res.status(500).send("DB error");
      res.render("participants/list", { participants: rows, events, req });
    });
  });
});

// Public signup page - shows events and registration form
router.get("/signup", (req, res) => {
  const filter = req.query.filter || 'all'; // all, upcoming, past
  
  // Build query based on filter
  let dateFilter = '';
  if (filter === 'upcoming') {
    dateFilter = 'WHERE e.EventDate >= CURDATE()';
  } else if (filter === 'past') {
    dateFilter = 'WHERE e.EventDate < CURDATE()';
  }
  // 'all' shows everything, no filter
  
  const sql = `
    SELECT e.EventID, e.EventName, e.EventDate, e.Venue,
           COUNT(DISTINCT p.ParticipantID) AS registeredCount,
           CASE 
             WHEN e.EventDate >= CURDATE() THEN 'upcoming'
             ELSE 'past'
           END AS eventStatus
    FROM event e
    LEFT JOIN participant p ON p.EventID = e.EventID
    ${dateFilter}
    GROUP BY e.EventID, e.EventName, e.EventDate, e.Venue
    ORDER BY e.EventDate DESC;
  `;
  
  db.query(sql, (err, events) => {
    if (err) {
      console.error("Signup events error:", err);
      return res.render("participants/signup", { events: [], error: null, currentFilter: filter });
    }
    res.render("participants/signup", { 
      events: events || [], 
      error: null,
      currentFilter: filter 
    });
  });
});

// GET registration form (for coordinators/admins - keeps existing functionality)
router.get("/register", (req, res) => {
  const preSelectedEventId = req.query.eventId;
  
  // Check if user is logged in as participant and get their details
  if (req.session?.user?.role === "participant" && req.session.user.linkedId) {
    const participantId = req.session.user.linkedId;
    db.query(
      "SELECT DISTINCT ParticipantName, Email, Phone FROM participant WHERE ParticipantID = ? LIMIT 1",
      [participantId],
      (err, rows) => {
        let participantData = null;
        if (!err && rows.length > 0) {
          participantData = {
            name: rows[0].ParticipantName,
            email: rows[0].Email,
            phone: rows[0].Phone
          };
        }
        // Continue to fetch events
        db.query("SELECT EventID, EventName FROM event", (err2, events) => {
          if (err2) return res.status(500).send("Database error");
          res.render("participants/register", { events, preSelectedEventId, participantData });
        });
      }
    );
  } else {
    // Not a participant, just fetch events
    db.query("SELECT EventID, EventName FROM event", (err, events) => {
      if (err) return res.status(500).send("Database error");
      res.render("participants/register", { events, preSelectedEventId, participantData: null });
    });
  }
});

// Public signup - CREATE participant and user account
router.post("/signup", async (req, res) => {
  const { name, email, phone, eventId, teamId, teamName, amountPaid, password, confirmPassword } = req.body;

  // Fetch events for error display
  const getEvents = () => {
    return new Promise((resolve) => {
      const sql = `
        SELECT e.EventID, e.EventName, e.EventDate, e.Venue,
               COUNT(DISTINCT p.ParticipantID) AS registeredCount,
               CASE 
                 WHEN e.EventDate >= CURDATE() THEN 'upcoming'
                 ELSE 'past'
               END AS eventStatus
        FROM event e
        LEFT JOIN participant p ON p.EventID = e.EventID
        GROUP BY e.EventID, e.EventName, e.EventDate, e.Venue
        ORDER BY e.EventDate DESC;
      `;
      db.query(sql, (err, events) => {
        resolve(events || []);
      });
    });
  };

  if (!name || !email || !eventId || !password) {
    const events = await getEvents();
    return res.render("participants/signup", { 
      events, 
      error: "Name, Email, Event, and Password are required",
      currentFilter: 'all'
    });
  }

  if (password !== confirmPassword) {
    const events = await getEvents();
    return res.render("participants/signup", { 
      events, 
      error: "Passwords do not match",
      currentFilter: 'all'
    });
  }

  try {
    // Generate username from email
    const username = email.split('@')[0] + '_' + Date.now().toString().slice(-6);
    
    // First create participant
    const participantSql = `
      INSERT INTO participant (EventID, ParticipantName, Email, Phone, TeamID, TeamName, PayStatus, AmountPaid, RegDate, AttendanceStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'pending')
    `;

    db.query(
      participantSql,
      [
        eventId,
        name,
        email,
        phone || null,
        teamId || null,
        teamName || null,
        amountPaid > 0 ? "paid" : "unpaid",
        amountPaid || 0
      ],
      async (err, result) => {
        if (err) {
          console.error("Participant creation error:", err);
          getEvents().then(events => {
            return res.render("participants/signup", { 
              events, 
              error: "Registration failed. Please try again.",
              currentFilter: 'all'
            });
          });
          return;
        }

        const participantId = result.insertId;

        // Create user account
        const { createUser } = require("../utils/user");
        createUser({
          username: username,
          password: password,
          role: "participant",
          linkedId: participantId,
          fullName: name
        }).then(() => {
          // If amount was paid, record as income
          if (amountPaid > 0) {
            const incomeSql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description) 
                           VALUES (?, 'participant', ?, 'Registration Fee', ?, ?, ?)`;
            db.query(incomeSql, [eventId, participantId, amountPaid, new Date(), `Registration fee from ${name}`], (incomeErr) => {
              if (incomeErr) {
                console.error("Income recording error:", incomeErr);
                // Don't fail the registration if income recording fails
              }
            });
          }
          
          // Show success page with credentials
          res.render("participants/signup-success", {
            participant: { name, email, phone, participantId },
            username: username,
            password: password,
            eventId: eventId
          });
        }).catch(async (userErr) => {
          console.error("User creation error:", userErr);
          // Rollback participant creation if user creation fails
          db.query("DELETE FROM participant WHERE ParticipantID = ?", [participantId]);
          const events = await getEvents();
          return res.render("participants/signup", { 
            events, 
            error: "Account creation failed. Please try again.",
            currentFilter: 'all'
          });
        });
      }
    );
  } catch (error) {
    console.error("Signup error:", error);
    const events = await getEvents();
    res.render("participants/signup", { 
      events, 
      error: "Registration failed. Please try again.",
      currentFilter: 'all'
    });
  }
});

// CREATE participant (for coordinators/admins - keeps existing functionality)
router.post("/register", (req, res) => {
  const { name, email, phone, eventId, teamId, teamName, payStatus, amountPaid, regDate } = req.body;

    const sql = `
      INSERT INTO participant (EventID, ParticipantName, Email, Phone, TeamID, TeamName, PayStatus, AmountPaid, RegDate, AttendanceStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    db.query(
        sql,
    [
      eventId,
      name,
      email,
      phone,
      teamId || null,
      teamName || null,
      payStatus || "unpaid",
      amountPaid || 0,
      regDate || new Date()
    ],
    (err, result) => {
            if (err) return res.status(500).send("Registration failed");
            
            // If amount was paid, record as income
            if (amountPaid > 0) {
              const participantId = result.insertId;
              const incomeSql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description) 
                             VALUES (?, 'participant', ?, 'Registration Fee', ?, ?, ?)`;
              db.query(incomeSql, [eventId, participantId, amountPaid, regDate || new Date(), `Registration fee from ${name}`], (incomeErr) => {
                if (incomeErr) {
                  console.error("Income recording error:", incomeErr);
                  // Don't fail the registration if income recording fails
                }
              });
            }
            
            res.send("<h2>Registration Successful!</h2>");
        }
    );
});

// EDIT form
router.get("/edit/:id", isAdminOrCoordinator, (req, res) => {
  const pid = req.params.id;
  db.query("SELECT * FROM participant WHERE ParticipantID = ?", [pid], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).send("Not found");
    const participant = rows[0];
    authorizeEventCoordinator(
      req,
      participant.EventID,
      () => {
        db.query("SELECT EventID, EventName FROM event", (e2, events) => {
          if (e2) return res.status(500).send("DB error");
          res.render("participants/edit", { participant, events });
        });
      },
      () => res.status(403).send("Forbidden")
    );
  });
});

// UPDATE participant
router.post("/edit/:id", isAdminOrCoordinator, (req, res) => {
  const pid = req.params.id;
  const { name, email, phone, eventId, teamId, teamName, payStatus, amountPaid, regDate, attendanceStatus } = req.body;

  db.query("SELECT EventID FROM participant WHERE ParticipantID = ?", [pid], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).send("Not found");
    const currentEventId = rows[0].EventID;
    authorizeEventCoordinator(
      req,
      currentEventId,
      () => {
        const sql = `
          UPDATE participant
          SET ParticipantName=?, Email=?, Phone=?, EventID=?, TeamID=?, TeamName=?, PayStatus=?, AmountPaid=?, RegDate=?, AttendanceStatus=?
          WHERE ParticipantID=?
        `;
        db.query(
          sql,
          [
            name,
            email,
            phone,
            eventId,
            teamId || null,
            teamName || null,
            payStatus || "unpaid",
            amountPaid || 0,
            regDate || new Date(),
            attendanceStatus || "pending",
            pid
          ],
          (e2) => {
            if (e2) return res.status(500).send("Update failed");
            
            // If amount was updated, record as income
            if (amountPaid > 0) {
              const incomeSql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description) 
                             VALUES (?, 'participant', ?, 'Registration Fee', ?, ?, ?)`;
              db.query(incomeSql, [eventId, pid, amountPaid, regDate || new Date(), `Registration fee from ${name}`], (incomeErr) => {
                if (incomeErr) {
                  console.error("Income recording error:", incomeErr);
                  // Don't fail the update if income recording fails
                }
              });
            }
            
            res.redirect("/participants/list");
          }
        );
      },
      () => res.status(403).send("Forbidden")
    );
  });
});

// DELETE participant
router.get("/delete/:id", isAdminOrCoordinator, (req, res) => {
  const pid = req.params.id;
  db.query("SELECT EventID FROM participant WHERE ParticipantID = ?", [pid], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).send("Not found");
    const currentEventId = rows[0].EventID;
    authorizeEventCoordinator(
      req,
      currentEventId,
      () => {
        db.query("DELETE FROM participant WHERE ParticipantID = ?", [pid], (e2) => {
          if (e2) return res.status(500).send("Delete failed");
          res.redirect("/participants/list");
        });
      },
      () => res.status(403).send("Forbidden")
    );
  });
});

// ATTENDANCE update (coordinator for the event or admin)
router.post("/:id/attendance", isAdminOrCoordinator, (req, res) => {
  const pid = req.params.id;
  const { attendanceStatus } = req.body; // expected: present | absent | pending

  db.query("SELECT EventID FROM participant WHERE ParticipantID = ?", [pid], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).send("Not found");
    const eventId = rows[0].EventID;
    authorizeEventCoordinator(
      req,
      eventId,
      () => {
        db.query(
          "UPDATE participant SET AttendanceStatus=? WHERE ParticipantID=?",
          [attendanceStatus || "pending", pid],
          (e2) => {
            if (e2) return res.status(500).send("Update failed");
            res.redirect("/participants/list");
          }
        );
      },
      () => res.status(403).send("Forbidden")
    );
  });
});

module.exports = router;
