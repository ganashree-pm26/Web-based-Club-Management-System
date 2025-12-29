const express = require("express");
const router = express.Router();
const db = require("../config/db");

// proper exportable middleware
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === "admin") {
        return next();
    }
    return res.redirect("/login");
}

// Admin dashboard route
router.get("/dashboard", isAdmin, (req, res) => {
    const sql = `
        SELECT 
            e.EventID,
            e.EventName,
            e.EventDate,
            e.Venue,
            (SELECT COUNT(*) FROM participant p WHERE p.EventID = e.EventID) AS totalParticipants,
            (SELECT SUM(AllocatedAmount) FROM budget b WHERE b.EventID = e.EventID) AS totalBudget,
            (SELECT SUM(Amount) FROM expenditure ex WHERE ex.EventID = e.EventID) AS totalSpent,
            (SELECT COUNT(*) FROM feedbackMapping f WHERE f.EventID = e.EventID) AS totalFeedback
        FROM event e
        ORDER BY e.EventDate DESC;
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.log("Admin dashboard SQL error:", err);
            return res.status(500).send("Database error");
        }

        res.render("admin/dashboard", { events: results, user: req.session.user });
    });
});

// ========== COORDINATOR MANAGEMENT ==========

// List all coordinators
router.get("/coordinators", isAdmin, (req, res) => {
    const sql = `
        SELECT m.*, c.ClubName,
               COUNT(DISTINCT co.EventID) AS eventCount
        FROM member m
        LEFT JOIN club c ON m.ClubID = c.ClubID
        LEFT JOIN coordinates co ON co.MemberID = m.MemberID
        WHERE m.Role = 'Coordinator'
        GROUP BY m.MemberID
        ORDER BY m.MemberName;
    `;
    db.query(sql, (err, coordinators) => {
        if (err) return res.status(500).send("DB error");
        db.query("SELECT * FROM club", (err2, clubs) => {
            if (err2) return res.status(500).send("DB error");
            db.query("SELECT * FROM event", (err3, events) => {
                if (err3) return res.status(500).send("DB error");
                res.render("admin/coordinators", { coordinators, clubs, events, user: req.session.user });
            });
        });
    });
});

// Create coordinator
router.post("/coordinators/create", isAdmin, async (req, res) => {
    const { memberName, email, phone, clubId } = req.body;
    
    // Insert member record
    const memberSql = `INSERT INTO member (MemberName, Email, Phone, ClubID, Role) VALUES (?, ?, ?, ?, 'Coordinator')`;
    
    db.query(memberSql, [memberName, email, phone, clubId || null], async (err, result) => {
        if (err) return res.status(500).send("Create failed");
        
        const memberId = result.insertId;
        
        // Generate username and password
        const username = `coord_${memberName.toLowerCase().replace(/\s+/g, '_')}`;
        const password = `Coord@${Math.floor(1000 + Math.random() * 9000)}`; // Generate a random 4-digit number
        
        // Create user account
        const { createUser } = require("../utils/user");
        try {
            await createUser({
                username: username,
                password: password,
                role: "coordinator",
                linkedId: memberId,
                fullName: memberName
            });
            
            // Show success page with credentials
            res.render("admin/coordinators-success", {
                member: { id: memberId, name: memberName, email: email, phone: phone },
                username: username,
                password: password
            });
        } catch (userErr) {
            console.error("User creation error:", userErr);
            // Rollback member creation if user creation fails
            db.query("DELETE FROM member WHERE MemberID = ?", [memberId], (rollbackErr) => {
                if (rollbackErr) console.error("Rollback failed:", rollbackErr);
            });
            res.status(500).send("User account creation failed");
        }
    });
});

// Assign coordinator to event
router.post("/coordinators/:memberId/assign-event", isAdmin, (req, res) => {
    const memberId = req.params.memberId;
    const { eventId } = req.body;
    db.query("INSERT IGNORE INTO coordinates (EventID, MemberID) VALUES (?, ?)", [eventId, memberId], (err) => {
        if (err) return res.status(500).send("Assignment failed");
        res.redirect("/admin/coordinators");
    });
});

// Remove coordinator from event
router.get("/coordinators/:memberId/remove-event/:eventId", isAdmin, (req, res) => {
    const { memberId, eventId } = req.params;
    db.query("DELETE FROM coordinates WHERE EventID = ? AND MemberID = ?", [eventId, memberId], (err) => {
        if (err) return res.status(500).send("Remove failed");
        res.redirect("/admin/coordinators");
    });
});

// Delete coordinator
router.get("/coordinators/:memberId/delete", isAdmin, (req, res) => {
    const memberId = req.params.memberId;
    // First remove from coordinates
    db.query("DELETE FROM coordinates WHERE MemberID = ?", [memberId], (err1) => {
        if (err1) return res.status(500).send("Delete failed");
        // Then delete member
        db.query("DELETE FROM member WHERE MemberID = ?", [memberId], (err2) => {
            if (err2) return res.status(500).send("Delete failed");
            res.redirect("/admin/coordinators");
        });
    });
});

// ========== MEMBER MANAGEMENT ==========

// List all members
router.get("/members", isAdmin, (req, res) => {
    const sql = `SELECT m.*, c.ClubName FROM member m LEFT JOIN club c ON m.ClubID = c.ClubID WHERE m.Role = 'Member' ORDER BY m.MemberName;`;
    db.query(sql, (err, members) => {
        if (err) return res.status(500).send("DB error");
        db.query("SELECT * FROM club", (err2, clubs) => {
            if (err2) return res.status(500).send("DB error");
            res.render("admin/members", { members, clubs, user: req.session.user });
        });
    });
});

// Create member
router.post("/members/create", isAdmin, async (req, res) => {
    const { memberName, email, phone, clubId } = req.body;
    
    // Insert member record
    const memberSql = `INSERT INTO member (MemberName, Email, Phone, ClubID, Role) VALUES (?, ?, ?, ?, 'Member')`;
    
    db.query(memberSql, [memberName, email, phone, clubId || null], async (err, result) => {
        if (err) return res.status(500).send("Create failed");
        
        const memberId = result.insertId;
        
        // Generate username and password
        const username = `member_${memberName.toLowerCase().replace(/\s+/g, '_')}`;
        const password = `Member@${Math.floor(1000 + Math.random() * 9000)}`; // Generate a random 4-digit number
        
        // Create user account
        const { createUser } = require("../utils/user");
        try {
            await createUser({
                username: username,
                password: password,
                role: "member",
                linkedId: memberId,
                fullName: memberName
            });
            
            // Show success page with credentials
            res.render("admin/members-success", {
                member: { id: memberId, name: memberName, email: email, phone: phone },
                username: username,
                password: password
            });
        } catch (userErr) {
            console.error("User creation error:", userErr);
            // Rollback member creation if user creation fails
            db.query("DELETE FROM member WHERE MemberID = ?", [memberId], (rollbackErr) => {
                if (rollbackErr) console.error("Rollback failed:", rollbackErr);
            });
            res.status(500).send("User account creation failed");
        }
    });
});

// Delete member
router.get("/members/:memberId/delete", isAdmin, (req, res) => {
    const memberId = req.params.memberId;
    db.query("DELETE FROM member WHERE MemberID = ?", [memberId], (err) => {
        if (err) return res.status(500).send("Delete failed");
        res.redirect("/admin/members");
    });
});

// ========== SPONSOR MANAGEMENT ==========

// List all sponsors
router.get("/sponsors", isAdmin, (req, res) => {
    const sql = `SELECT s.*, e.EventName FROM sponsor s LEFT JOIN event e ON s.EventID = e.EventID ORDER BY s.SponsorName;`;
    db.query(sql, (err, sponsors) => {
        if (err) return res.status(500).send("DB error");
        db.query("SELECT * FROM event", (err2, events) => {
            if (err2) return res.status(500).send("DB error");
            res.render("admin/sponsors", { sponsors, events, user: req.session.user });
        });
    });
});

// Create sponsor
router.post("/sponsors/create", isAdmin, async (req, res) => {
    const { sponsorName, eventId, contribution } = req.body;
    
    // Insert sponsor record
    const sponsorSql = `INSERT INTO sponsor (SponsorName, EventID, Contribution) VALUES (?, ?, ?)`;
    
    db.query(sponsorSql, [sponsorName, eventId || null, contribution || 0], async (err, result) => {
        if (err) return res.status(500).send("Create failed");
        
        const sponsorId = result.insertId;
        
        // Generate username and password
        const username = `sponsor_${sponsorName.toLowerCase().replace(/\s+/g, '_')}`;
        const password = `Sponsor@${Math.floor(1000 + Math.random() * 9000)}`; // Generate a random 4-digit number
        
        // Create user account
        const { createUser } = require("../utils/user");
        try {
            await createUser({
                username: username,
                password: password,
                role: "sponsor",
                linkedId: sponsorId,
                fullName: sponsorName
            });
            
            // If contribution was provided, record as income
            if (contribution > 0) {
              const incomeSql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description) 
                             VALUES (?, 'sponsor', ?, 'Sponsorship', ?, CURDATE(), ?)`;
              db.query(incomeSql, [eventId, sponsorId, contribution, `Sponsor contribution from ${sponsorName}`], (incomeErr) => {
                if (incomeErr) {
                  console.error("Income recording error:", incomeErr);
                  // Don't fail the sponsor creation if income recording fails
                }
              });
            }
            
            // Show success page with credentials
            res.render("admin/sponsors-success", {
                sponsor: { id: sponsorId, name: sponsorName, eventId: eventId, contribution: contribution },
                username: username,
                password: password
            });
        } catch (userErr) {
            console.error("User creation error:", userErr);
            // Rollback sponsor creation if user creation fails
            db.query("DELETE FROM sponsor WHERE SponsorID = ?", [sponsorId], (rollbackErr) => {
                if (rollbackErr) console.error("Rollback failed:", rollbackErr);
            });
            res.status(500).send("User account creation failed");
        }
    });
});

// Update sponsor
router.post("/sponsors/:sponsorId/update", isAdmin, async (req, res) => {
    const sponsorId = req.params.sponsorId;
    const { sponsorName, eventId, contribution } = req.body;
    
    // Update sponsor record
    const sponsorSql = `UPDATE sponsor SET SponsorName=?, EventID=?, Contribution=? WHERE SponsorID=?`;
    
    db.query(sponsorSql, [sponsorName, eventId || null, contribution || 0, sponsorId], async (err, result) => {
        if (err) return res.status(500).send("Update failed");
        
        // If contribution was updated, record as income
        if (contribution > 0) {
          // First check if there's already an income record for this sponsor
          const checkIncomeSql = `SELECT * FROM income WHERE SourceType = 'sponsor' AND SourceID = ?`;
          db.query(checkIncomeSql, [sponsorId], (checkErr, incomeResults) => {
            if (checkErr) {
              console.error("Income check error:", checkErr);
            } else {
              if (incomeResults.length > 0) {
                // Update existing income record
                const updateIncomeSql = `UPDATE income SET EventID=?, Amount=?, Description=? WHERE SourceType='sponsor' AND SourceID=?`;
                db.query(updateIncomeSql, [eventId, contribution, `Sponsor contribution from ${sponsorName}`, sponsorId], (updateErr) => {
                  if (updateErr) {
                    console.error("Income update error:", updateErr);
                  }
                });
              } else {
                // Create new income record
                const incomeSql = `INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description) 
                               VALUES (?, 'sponsor', ?, 'Sponsorship', ?, CURDATE(), ?)`;
                db.query(incomeSql, [eventId, sponsorId, contribution, `Sponsor contribution from ${sponsorName}`], (incomeErr) => {
                  if (incomeErr) {
                    console.error("Income recording error:", incomeErr);
                  }
                });
              }
            }
          });
        }
        
        res.redirect("/admin/sponsors");
    });
});

// Delete sponsor
router.get("/sponsors/:sponsorId/delete", isAdmin, (req, res) => {
    const sponsorId = req.params.sponsorId;
    
    // Also delete related income records
    db.query("DELETE FROM income WHERE SourceType = 'sponsor' AND SourceID = ?", [sponsorId], (incomeErr) => {
        if (incomeErr) {
            console.error("Income deletion error:", incomeErr);
            // Continue with sponsor deletion even if income deletion fails
        }
        
        db.query("DELETE FROM sponsor WHERE SponsorID = ?", [sponsorId], (err) => {
            if (err) return res.status(500).send("Delete failed");
            res.redirect("/admin/sponsors");
        });
    });
});

// ========== BUDGET MANAGEMENT ==========

// Budget allocation page for an event
router.get("/events/:eventId/budget", isAdmin, (req, res) => {
    const eventId = req.params.eventId;
    db.query("SELECT * FROM event WHERE EventID = ?", [eventId], (err, eventRows) => {
        if (err || eventRows.length === 0) return res.status(404).send("Event not found");
        const event = eventRows[0];
        
        db.query("SELECT * FROM budget WHERE EventID = ? ORDER BY Category", [eventId], (err2, budgets) => {
            if (err2) return res.status(500).send("DB error");
            res.render("admin/budget", { event, budgets, user: req.session.user });
        });
    });
});

// Create budget allocation
router.post("/events/:eventId/budget/create", isAdmin, (req, res) => {
    const eventId = req.params.eventId;
    const { category, allocatedAmount, budgetExplanation } = req.body;
    const adminName = req.session.user.name || req.session.user.username;
    
    const sql = `INSERT INTO budget (EventID, Category, AllocatedAmount, ApprovedBy, ApprovalDate, BudgetExplanation) 
                 VALUES (?, ?, ?, ?, CURDATE(), ?)`;
    db.query(sql, [eventId, category, allocatedAmount, adminName, budgetExplanation || null], (err) => {
        if (err) return res.status(500).send("Create failed");
        res.redirect(`/admin/events/${eventId}/budget`);
    });
});

// Update budget allocation
router.post("/events/:eventId/budget/:budgetId/update", isAdmin, (req, res) => {
    const { eventId, budgetId } = req.params;
    const { category, allocatedAmount, budgetExplanation } = req.body;
    const adminName = req.session.user.name || req.session.user.username;
    
    const sql = `UPDATE budget SET Category=?, AllocatedAmount=?, ApprovedBy=?, ApprovalDate=CURDATE(), BudgetExplanation=? 
                 WHERE BudgetID=? AND EventID=?`;
    db.query(sql, [category, allocatedAmount, adminName, budgetExplanation || null, budgetId, eventId], (err) => {
        if (err) return res.status(500).send("Update failed");
        res.redirect(`/admin/events/${eventId}/budget`);
    });
});

// Delete budget allocation
router.get("/events/:eventId/budget/:budgetId/delete", isAdmin, (req, res) => {
    const { eventId, budgetId } = req.params;
    db.query("DELETE FROM budget WHERE BudgetID = ? AND EventID = ?", [budgetId, eventId], (err) => {
        if (err) return res.status(500).send("Delete failed");
        res.redirect(`/admin/events/${eventId}/budget`);
    });
});

// ========== EXPENDITURE APPROVAL ==========

// Expenditure approval page
router.get("/expenditures", isAdmin, (req, res) => {
    const sql = `
        SELECT ex.*, e.EventName, e.EventDate
        FROM expenditure ex
        JOIN event e ON ex.EventID = e.EventID
        ORDER BY ex.ExpenseDate DESC;
    `;
    db.query(sql, (err, expenditures) => {
        if (err) return res.status(500).send("DB error");
        
        // Get budget info for each expenditure
        const expPromises = expenditures.map(exp => {
            return new Promise((resolve) => {
                db.query(
                    `SELECT SUM(AllocatedAmount) AS totalBudget, 
                            SUM(Amount) AS totalSpent 
                     FROM budget b
                     LEFT JOIN expenditure e ON e.EventID = b.EventID AND e.Category = b.Category
                     WHERE b.EventID = ? AND b.Category = ?`,
                    [exp.EventID, exp.Category],
                    (err2, budgetRows) => {
                        exp.budgetInfo = budgetRows[0] || { totalBudget: 0, totalSpent: 0 };
                        resolve(exp);
                    }
                );
            });
        });
        
        Promise.all(expPromises).then(exps => {
            res.render("admin/expenditures", { expenditures: exps, user: req.session.user });
        });
    });
});

// ========== BUDGET UTILIZATION REPORTS ==========

// Budget utilization report
router.get("/reports/budget-utilization", isAdmin, (req, res) => {
    const sql = `
        SELECT 
            e.EventID,
            e.EventName,
            e.EventDate,
            COALESCE(SUM(b.AllocatedAmount), 0) AS totalBudget,
            COALESCE(SUM(ex.Amount), 0) AS totalSpent,
            COALESCE(SUM(b.AllocatedAmount), 0) - COALESCE(SUM(ex.Amount), 0) AS remaining,
            (COALESCE(SUM(ex.Amount), 0) / NULLIF(COALESCE(SUM(b.AllocatedAmount), 0), 0) * 100) AS utilizationPercent
        FROM event e
        LEFT JOIN budget b ON b.EventID = e.EventID
        LEFT JOIN expenditure ex ON ex.EventID = e.EventID
        GROUP BY e.EventID, e.EventName, e.EventDate
        ORDER BY e.EventDate DESC;
    `;
    
    db.query(sql, (err, events) => {
        if (err) return res.status(500).send("DB error");
        
        // Get category-wise breakdown
        const categorySql = `
            SELECT 
                b.EventID,
                b.Category,
                b.AllocatedAmount,
                COALESCE(SUM(ex.Amount), 0) AS Spent,
                b.AllocatedAmount - COALESCE(SUM(ex.Amount), 0) AS Remaining
            FROM budget b
            LEFT JOIN expenditure ex ON ex.EventID = b.EventID AND ex.Category = b.Category
            GROUP BY b.EventID, b.Category, b.AllocatedAmount
            ORDER BY b.EventID, b.Category;
        `;
        
        db.query(categorySql, (err2, categories) => {
            if (err2) return res.status(500).send("DB error");
            
            // Group categories by event
            const categoriesByEvent = {};
            categories.forEach(cat => {
                if (!categoriesByEvent[cat.EventID]) {
                    categoriesByEvent[cat.EventID] = [];
                }
                categoriesByEvent[cat.EventID].push(cat);
            });
            
            res.render("admin/budget-report", { 
                events, 
                categoriesByEvent, 
                user: req.session.user 
            });
        });
    });
});

// Analytics dashboard for data-driven decision support
router.get("/analytics", isAdmin, (req, res) => {
    // Query 1: Track participant turnout per event (no date restriction)
    const turnoutSql = `
        SELECT 
            e.EventID,
            e.EventName,
            e.EventDate,
            COALESCE(p.registrationCount, 0) AS registrationCount,
            COALESCE(p.attendanceCount, 0) AS attendanceCount,
            CASE 
                WHEN COALESCE(p.registrationCount, 0) > 0 THEN 
                    ROUND((COALESCE(p.attendanceCount, 0) * 100.0 / p.registrationCount), 2)
                ELSE 0 
            END AS attendancePercentage
        FROM event e
        LEFT JOIN (
            SELECT 
                EventID,
                COUNT(*) AS registrationCount,
                COUNT(CASE WHEN AttendanceStatus = 'Present' THEN 1 END) AS attendanceCount
            FROM participant
            GROUP BY EventID
        ) p ON e.EventID = p.EventID
        ORDER BY e.EventDate DESC
        LIMIT 10
    `;
    
    // Query 2: Budget allocation vs expenditures
    const budgetSql = `
        SELECT 
            e.EventID,
            e.EventName,
            COALESCE(b.totalBudget, 0) AS totalBudget,
            COALESCE(ex.totalExpenditure, 0) AS totalExpenditure,
            (COALESCE(b.totalBudget, 0) - COALESCE(ex.totalExpenditure, 0)) AS remainingBudget,
            CASE 
                WHEN COALESCE(b.totalBudget, 0) > 0 THEN 
                    ROUND((COALESCE(ex.totalExpenditure, 0) * 100.0 / b.totalBudget), 2)
                ELSE 0 
            END AS budgetUtilizationPercent
        FROM event e
        LEFT JOIN (
            SELECT EventID, SUM(AllocatedAmount) AS totalBudget
            FROM budget
            GROUP BY EventID
        ) b ON e.EventID = b.EventID
        LEFT JOIN (
            SELECT EventID, SUM(Amount) AS totalExpenditure
            FROM expenditure
            GROUP BY EventID
        ) ex ON e.EventID = ex.EventID
        ORDER BY e.EventDate DESC
        LIMIT 10
    `;
    
    // Query 3: Overall summary statistics (no date restriction)
    const totalEventsSql = "SELECT COUNT(*) as totalEvents FROM event";
    const totalRegistrationsSql = "SELECT COUNT(*) as totalRegistrations FROM participant";
    const totalAttendeesSql = "SELECT COUNT(*) as totalAttendees FROM participant WHERE AttendanceStatus = 'Present'";
    const totalIncomeSql = "SELECT COALESCE(SUM(Amount), 0) as totalIncome FROM income";
    const totalExpenditureSql = "SELECT COALESCE(SUM(Amount), 0) as totalExpenditure FROM expenditure";
    
    // Query 4: Event participation trends (no date restriction)
    const trendSql = `
        SELECT 
            e.EventID,
            e.EventName,
            e.EventDate,
            e.Venue,
            COALESCE(p.registrationCount, 0) AS registrationCount,
            COALESCE(p.attendanceCount, 0) AS attendanceCount
        FROM event e
        LEFT JOIN (
            SELECT 
                EventID,
                COUNT(*) AS registrationCount,
                COUNT(CASE WHEN AttendanceStatus = 'Present' THEN 1 END) AS attendanceCount
            FROM participant
            GROUP BY EventID
        ) p ON e.EventID = p.EventID
        ORDER BY e.EventDate DESC
    `;
    
    // Execute queries sequentially to avoid nested callback issues
    db.query(totalEventsSql, (err, totalEventsResult) => {
        if (err) {
            console.error('Total events query error:', err);
            return res.status(500).send("Database error");
        }
        
        db.query(totalRegistrationsSql, (err, totalRegistrationsResult) => {
            if (err) {
                console.error('Total registrations query error:', err);
                return res.status(500).send("Database error");
            }
            
            db.query(totalAttendeesSql, (err, totalAttendeesResult) => {
                if (err) {
                    console.error('Total attendees query error:', err);
                    return res.status(500).send("Database error");
                }
                
                db.query(totalIncomeSql, (err, totalIncomeResult) => {
                    if (err) {
                        console.error('Total income query error:', err);
                        return res.status(500).send("Database error");
                    }
                    
                    db.query(totalExpenditureSql, (err, totalExpenditureResult) => {
                        if (err) {
                            console.error('Total expenditure query error:', err);
                            return res.status(500).send("Database error");
                        }
                        
                        db.query(turnoutSql, (err, turnoutResults) => {
                            if (err) {
                                console.error('Turnout query error:', err);
                                return res.status(500).send("Database error");
                            }
                            
                            db.query(budgetSql, (err, budgetResults) => {
                                if (err) {
                                    console.error('Budget query error:', err);
                                    return res.status(500).send("Database error");
                                }
                                
                                db.query(trendSql, (err, trendResults) => {
                                    if (err) {
                                        console.error('Trend query error:', err);
                                        return res.status(500).send("Database error");
                                    }
                                    
                                    // Calculate net profit
                                    const netProfit = parseFloat(totalIncomeResult[0].totalIncome || 0) - parseFloat(totalExpenditureResult[0].totalExpenditure || 0);
                                    
                                    // Combine all summary data
                                    const summary = {
                                        totalEvents: totalEventsResult[0].totalEvents || 0,
                                        totalRegistrations: totalRegistrationsResult[0].totalRegistrations || 0,
                                        totalAttendees: totalAttendeesResult[0].totalAttendees || 0,
                                        totalIncome: totalIncomeResult[0].totalIncome || 0,
                                        totalExpenditure: totalExpenditureResult[0].totalExpenditure || 0,
                                        netProfit: netProfit
                                    };
                                    
                                    res.render("admin/analytics", { 
                                        summary: summary,
                                        turnoutData: turnoutResults,
                                        budgetData: budgetResults,
                                        trendData: trendResults,
                                        user: req.session.user 
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Export both router and middleware correctly
module.exports = {
    router,
    isAdmin
};
