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
    // Use aggregated subqueries for budgets and expenditures to avoid
    // duplication when joining multiple budget rows with multiple expenditures.
    const sql = `
        SELECT
            e.EventID,
            e.EventName,
            e.EventDate,
            COALESCE(bsum.totalBudget, 0) AS totalBudget,
            COALESCE(exsum.totalSpent, 0) AS totalSpent,
            COALESCE(bsum.totalBudget, 0) - COALESCE(exsum.totalSpent, 0) AS remaining,
            CASE WHEN COALESCE(bsum.totalBudget, 0) = 0 THEN 0
                 ELSE (COALESCE(exsum.totalSpent, 0) / bsum.totalBudget * 100)
            END AS utilizationPercent
        FROM event e
        LEFT JOIN (
            SELECT EventID, SUM(AllocatedAmount) AS totalBudget
            FROM budget
            GROUP BY EventID
        ) bsum ON bsum.EventID = e.EventID
        LEFT JOIN (
            SELECT EventID, SUM(Amount) AS totalSpent
            FROM expenditure
            GROUP BY EventID
        ) exsum ON exsum.EventID = e.EventID
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
            
            // Group categories by event and compute per-event category totals
            const categoriesByEvent = {};
            const categoryTotalsByEvent = {}; // { eventId: { allocated: X, spent: Y, remaining: Z } }
            categories.forEach(cat => {
                if (!categoriesByEvent[cat.EventID]) {
                    categoriesByEvent[cat.EventID] = [];
                    categoryTotalsByEvent[cat.EventID] = { allocated: 0, spent: 0, remaining: 0 };
                }
                categoriesByEvent[cat.EventID].push(cat);
                const a = parseFloat(cat.AllocatedAmount) || 0;
                const s = parseFloat(cat.Spent) || 0;
                const r = parseFloat(cat.Remaining) || (a - s);
                categoryTotalsByEvent[cat.EventID].allocated += a;
                categoryTotalsByEvent[cat.EventID].spent += s;
                categoryTotalsByEvent[cat.EventID].remaining += r;
            });

            // Log mismatches between event totals and summed category totals to help debugging
            events.forEach(ev => {
                const evtId = ev.EventID;
                const evtBudget = parseFloat(ev.totalBudget) || 0;
                const evtSpent = parseFloat(ev.totalSpent) || 0;
                const catTotals = categoryTotalsByEvent[evtId] || { allocated: 0, spent: 0, remaining: 0 };
                if (Math.abs(evtBudget - catTotals.allocated) > 0.001 || Math.abs(evtSpent - catTotals.spent) > 0.001) {
                    console.warn(`Budget mismatch for EventID=${evtId} (${ev.EventName}): event.totalBudget=${evtBudget}, sum(categories.allocated)=${catTotals.allocated}; event.totalSpent=${evtSpent}, sum(categories.spent)=${catTotals.spent}`);
                }
            });

            res.render("admin/budget-report", { 
                events, 
                categoriesByEvent, 
                categoryTotalsByEvent,
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
    const totalBudgetSql = "SELECT COALESCE(SUM(AllocatedAmount), 0) as totalBudget FROM budget";
    
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
                    
                    // Add query for total budget
                    const totalBudgetSql = "SELECT COALESCE(SUM(AllocatedAmount), 0) as totalBudget FROM budget";
                    
                    db.query(totalBudgetSql, (err, totalBudgetResult) => {
                        if (err) {
                            console.error('Total budget query error:', err);
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
                                        
                                        // Calculate net profit: Income - Expenditure + Budget
                                        const totalBudget = parseFloat(totalBudgetResult[0].totalBudget || 0);
                                        const totalIncome = parseFloat(totalIncomeResult[0].totalIncome || 0);
                                        const totalExpenditure = parseFloat(totalExpenditureResult[0].totalExpenditure || 0);
                                        const netProfit = totalIncome - totalExpenditure + totalBudget;
                                        
                                        console.log('Analytics Summary:');
                                        console.log('Total Budget:', totalBudget);
                                        console.log('Total Income:', totalIncome);
                                        console.log('Total Expenditure:', totalExpenditure);
                                        console.log('Net Profit (Income - Expenditure + Budget):', netProfit);
                                        
                                        // Combine all summary data
                                        const summary = {
                                            totalEvents: totalEventsResult[0].totalEvents || 0,
                                            totalRegistrations: totalRegistrationsResult[0].totalRegistrations || 0,
                                            totalAttendees: totalAttendeesResult[0].totalAttendees || 0,
                                            totalIncome: totalIncome,
                                            totalExpenditure: totalExpenditure,
                                            totalBudget: totalBudget,
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
});

// Export both router and middleware correctly
module.exports = {
    router,
    isAdmin
};

// ========== EVENT PDF SUMMARY DOWNLOAD (with charts & feedback analysis) ==========
router.get("/events/:eventId/download-pdf", isAdmin, (req, res) => {
    const eventId = req.params.eventId;
    const PDFDocument = require('pdfkit');
    const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
    const { MongoClient, ObjectId } = require('mongodb');
    const natural = require('natural');
    const { SentimentAnalyzer, PorterStemmer } = natural;

    const mongoUrl = 'mongodb://localhost:27017';
    const mongoDBName = 'club_feedback';
    const mongoCollection = 'feedback';

    const eventSql = `SELECT * FROM event WHERE EventID = ?`;
    const participantsSql = `SELECT COUNT(*) as totalParticipants FROM participant WHERE EventID = ?`;
    const participantsStatusSql = `SELECT AttendanceStatus, COUNT(*) as cnt FROM participant WHERE EventID = ? GROUP BY AttendanceStatus`;
    const budgetSql = `SELECT SUM(AllocatedAmount) as totalBudget FROM budget WHERE EventID = ?`;
    const expenditureSql = `SELECT SUM(Amount) as totalSpent FROM expenditure WHERE EventID = ?`;
    const feedbackCountSql = `SELECT COUNT(*) as totalFeedback FROM feedbackMapping WHERE EventID = ?`;
    const feedbackMappingSql = `SELECT MongoFeedbackKey FROM feedbackMapping WHERE EventID = ?`;
    const coordinatorsSql = `
        SELECT DISTINCT m.MemberName, m.Email, m.Phone 
        FROM coordinates c
        JOIN member m ON c.MemberID = m.MemberID
        WHERE c.EventID = ?
    `;
    const membersSql = `
        SELECT DISTINCT m.MemberName, m.Email, m.Phone 
        FROM member m
        JOIN participant p ON m.MemberID = p.MemberID
        WHERE p.EventID = ?
    `;
    const sponsorsSql = `SELECT SponsorName, Contribution FROM sponsor WHERE EventID = ?`;
    const budgetDetailsSql = `SELECT Category, AllocatedAmount FROM budget WHERE EventID = ? ORDER BY Category`;
    const expenditureDetailsSql = `SELECT Category, SUM(Amount) as Amount FROM expenditure WHERE EventID = ? GROUP BY Category ORDER BY Category`;

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="event-summary-${eventId}.pdf"`);
    doc.pipe(res);

    db.query(eventSql, [eventId], (err, eventRows) => {
        if (err || eventRows.length === 0) return res.status(404).send('Event not found');
        const event = eventRows[0];

        let participants, participantsStatus = [], budget, expenditure, feedbackCount, feedbackDocs = [], coordinators, members, sponsors, budgetDetails, expenditureDetails;
        let completed = 0; const needed = 10;
        const done = () => { if (++completed === needed) proceed(); };

        db.query(participantsSql, [eventId], (e, r) => { participants = r[0] || { totalParticipants: 0 }; done(); });
        db.query(participantsStatusSql, [eventId], (e, r) => { participantsStatus = r || []; done(); });
        db.query(budgetSql, [eventId], (e, r) => { budget = r[0] || { totalBudget: 0 }; done(); });
        db.query(expenditureSql, [eventId], (e, r) => { expenditure = r[0] || { totalSpent: 0 }; done(); });
        db.query(feedbackCountSql, [eventId], (e, r) => { feedbackCount = r[0] || { totalFeedback: 0 }; done(); });

        // mapping -> mongo docs
        db.query(feedbackMappingSql, [eventId], async (e, rows) => {
            try {
                if (!rows || rows.length === 0) { feedbackDocs = []; done(); return; }
                const keys = rows.map(x => x.MongoFeedbackKey).filter(Boolean);
                if (keys.length === 0) { feedbackDocs = []; done(); return; }
                const client = new MongoClient(mongoUrl);
                await client.connect();
                const dbMongo = client.db(mongoDBName);
                const objectIds = [], stringKeys = [];
                keys.forEach(k => { if (/^[0-9a-fA-F]{24}$/.test(k)) { try { objectIds.push(new ObjectId(k)); } catch(_) { stringKeys.push(k); } } else stringKeys.push(k); });
                const conds = [];
                if (objectIds.length) conds.push({ _id: { $in: objectIds } });
                if (stringKeys.length) conds.push({ feedbackKey: { $in: stringKeys } });
                let q = {};
                if (conds.length === 1) q = conds[0]; else if (conds.length > 1) q = { $or: conds };
                feedbackDocs = Object.keys(q).length ? await dbMongo.collection(mongoCollection).find(q).toArray() : [];
                await client.close();
            } catch (ex) { console.error('feedback mongo error', ex); feedbackDocs = []; }
            done();
        });

        db.query(coordinatorsSql, [eventId], (e, r) => { coordinators = r || []; done(); });
        db.query(membersSql, [eventId], (e, r) => { members = r || []; done(); });
        db.query(sponsorsSql, [eventId], (e, r) => { sponsors = r || []; done(); });
        db.query(budgetDetailsSql, [eventId], (e, r) => { budgetDetails = r || []; done(); });
        db.query(expenditureDetailsSql, [eventId], (e, r) => { expenditureDetails = r || []; done(); });

        const proceed = async () => {
            try {
                const width = 700, height = 350;
                const chartRenderer = new ChartJSNodeCanvas({ width, height });

                // Header and Event Details (textual)
                doc.fontSize(20).font('Helvetica-Bold').text('EVENT SUMMARY', { align: 'center' });
                doc.moveDown(0.3);
                doc.fontSize(12).font('Helvetica-Bold').text(event.EventName);
                doc.fontSize(10).font('Helvetica').text(`Date: ${new Date(event.EventDate).toLocaleDateString()}    Venue: ${event.Venue}`);
                doc.moveDown(0.4);

                // Key statistics (text)
                doc.fontSize(12).font('Helvetica-Bold').text('Key Statistics');
                doc.fontSize(11).font('Helvetica');
                doc.text(`Total Participants: ${participants.totalParticipants || 0}`);
                doc.text(`Total Feedback Responses: ${feedbackCount ? feedbackCount.totalFeedback : 0}`);
                const totalBudget = (budget && budget.totalBudget) ? Number(budget.totalBudget) : 0;
                const totalSpent = (expenditure && expenditure.totalSpent) ? Number(expenditure.totalSpent) : 0;
                const utilization = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(2) : '0.00';
                doc.text(`Total Budget Allocated: ₹${totalBudget.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                doc.text(`Total Amount Spent: ₹${totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                doc.text(`Budget Utilization: ${utilization}%`);
                doc.moveDown(0.3);

                // Budget breakdown text
                if (budgetDetails && budgetDetails.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Budget Breakdown');
                    doc.fontSize(10).font('Helvetica');
                    budgetDetails.forEach(bd => {
                        doc.text(`• ${bd.Category}: ₹${Number(bd.AllocatedAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                    });
                    doc.moveDown(0.2);
                }

                // Expenditure breakdown text
                if (expenditureDetails && expenditureDetails.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Expenditure Breakdown');
                    doc.fontSize(10).font('Helvetica');
                    expenditureDetails.forEach(ed => {
                        doc.text(`• ${ed.Category}: ₹${Number(ed.Amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                    });
                    doc.moveDown(0.2);
                }

                // Coordinators
                if (coordinators && coordinators.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Coordinators');
                    doc.fontSize(10).font('Helvetica');
                    coordinators.forEach((c, i) => {
                        doc.text(`${i+1}. ${c.MemberName} ${c.Email ? `| ${c.Email}` : ''} ${c.Phone ? `| ${c.Phone}` : ''}`);
                    });
                    doc.moveDown(0.2);
                }

                // Members (truncated)
                if (members && members.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Participating Members (sample)');
                    doc.fontSize(10).font('Helvetica');
                    members.slice(0, 15).forEach((m, i) => doc.text(`${i+1}. ${m.MemberName}`));
                    if (members.length > 15) doc.text(`... and ${members.length-15} more members`);
                    doc.moveDown(0.2);
                }

                // Sponsors
                if (sponsors && sponsors.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Sponsors');
                    doc.fontSize(10).font('Helvetica');
                    sponsors.forEach((s, i) => doc.text(`${i+1}. ${s.SponsorName} — ₹${Number(s.Contribution||0).toLocaleString('en-IN', {maximumFractionDigits:2})}`));
                    doc.moveDown(0.2);
                }

                // Put charts on new pages so they render fully
                // Budget utilization chart
                try {
                    doc.addPage();
                    const spent = Number(totalSpent || 0);
                    const remaining = Math.max(0, Number(totalBudget || 0) - spent);
                    const budgetCfg = {
                        type: 'doughnut',
                        data: { labels: ['Spent', 'Remaining'], datasets: [{ data: (spent === 0 && remaining === 0) ? [0,1] : [spent, remaining], backgroundColor: ['#43e97b', '#4facfe'] }] },
                        options: { plugins: { legend: { display: true } } }
                    };
                    const buf1 = await chartRenderer.renderToBuffer(budgetCfg);
                    doc.fontSize(12).font('Helvetica-Bold').text('Budget Utilization', { align: 'left' });
                    doc.image(buf1, { fit: [500, 260], align: 'center' });
                } catch (e) {
                    console.error('Budget chart rendering error', e);
                }

                // Participation chart
                try {
                    doc.addPage();
                    const pLabels = (participantsStatus && participantsStatus.length) ? participantsStatus.map(s => s.AttendanceStatus || 'Unknown') : ['No Data'];
                    const pVals = (participantsStatus && participantsStatus.length) ? participantsStatus.map(s => Number(s.cnt || 0)) : [1];
                    const partCfg = { type: 'pie', data: { labels: pLabels, datasets: [{ data: pVals, backgroundColor: ['#4facfe', '#43e97b', '#f093fb'] }] }, options: { plugins: { legend: { display: true } } } };
                    const buf2 = await chartRenderer.renderToBuffer(partCfg);
                    doc.fontSize(12).font('Helvetica-Bold').text('Participation Analytics', { align: 'left' });
                    doc.image(buf2, { fit: [500, 260], align: 'center' });
                } catch (e) {
                    console.error('Participation chart rendering error', e);
                }

                // Feedback charts and analysis
                if (feedbackDocs && feedbackDocs.length > 0) {
                    try {
                        doc.addPage();
                        const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                        feedbackDocs.forEach(f => { const r = parseInt(f.rating || 0) || 0; if (ratingCounts[r] !== undefined) ratingCounts[r]++; });
                        const rLabels = Object.keys(ratingCounts);
                        const rVals = Object.values(ratingCounts);
                        const ratingsCfg = { type: 'bar', data: { labels: rLabels, datasets: [{ label: 'Ratings', data: rVals, backgroundColor: ['#ff6384', '#36a2eb', '#ffcd56', '#4bc0c0', '#9966ff'] }] }, options: { plugins: { legend: { display: false } } } };
                        const buf3 = await chartRenderer.renderToBuffer(ratingsCfg);
                        doc.fontSize(12).font('Helvetica-Bold').text('Ratings Distribution', { align: 'left' });
                        doc.image(buf3, { fit: [500, 260], align: 'center' });

                        // Sentiment
                        const analyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
                        const sentiments = { positive: 0, neutral: 0, negative: 0 };
                        feedbackDocs.forEach(f => {
                            const rating = parseInt(f.rating || 0);
                            let rSent = 0; if (rating >= 4) rSent = 1; else if (rating <= 2) rSent = -1;
                            let txtSent = 0; const text = (f.comment || f.comments || '').toString().trim(); if (text) txtSent = analyzer.getSentiment(new natural.WordTokenizer().tokenize(text.toLowerCase()));
                            const comb = rSent !== 0 ? rSent : Math.sign(txtSent);
                            if (comb > 0) sentiments.positive++; else if (comb < 0) sentiments.negative++; else sentiments.neutral++;
                        });
                        const sentCfg = { type: 'pie', data: { labels: ['Positive', 'Neutral', 'Negative'], datasets: [{ data: [sentiments.positive, sentiments.neutral, sentiments.negative], backgroundColor: ['#43e97b', '#4facfe', '#ff6384'] }] } };
                        const buf4 = await chartRenderer.renderToBuffer(sentCfg);
                        doc.moveDown(0.2);
                        doc.fontSize(12).font('Helvetica-Bold').text('Feedback Sentiment', { align: 'left' });
                        doc.image(buf4, { fit: [500, 260], align: 'center' });

                        // Sample comments
                        const sampleComments = feedbackDocs.filter(f => (f.comment || f.comments || '').toString().trim() !== '').slice(0, 5).map(f => ({ rating: f.rating || '', text: (f.comment || f.comments || '').toString().trim() }));
                        if (sampleComments.length) {
                            doc.addPage();
                            doc.fontSize(11).font('Helvetica-Bold').text('Sample Feedback Comments');
                            doc.moveDown(0.2);
                            doc.fontSize(10).font('Helvetica');
                            sampleComments.forEach((c, i) => { doc.text(`${i+1}. (${c.rating}) ${c.text}`); doc.moveDown(0.1); });
                        }
                    } catch (e) {
                        console.error('Feedback charts rendering error', e);
                    }
                }

                // Footer
                doc.addPage();
                doc.moveDown(1);
                doc.fontSize(9).text('Generated by Club Management System', { align: 'center' });
                doc.end();
            } catch (err) {
                console.error('PDF route error', err);
                try { doc.end(); } catch (_) {}
            }
        };
    });
});
