const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isSponsor } = require("../middleware/role");

// Sponsor dashboard: list events this sponsor supports with breakdown
router.get("/dashboard", isSponsor, (req, res) => {
  const sponsorId = req.session.user.linkedId;
  
  // Get sponsor info first
  db.query("SELECT SponsorID, SponsorName FROM sponsor WHERE SponsorID = ?", [sponsorId], (err0, sponsorRows) => {
    if (err0) return res.status(500).send("DB error");
    
    if (sponsorRows.length === 0) {
      return res.render("sponsors/dashboard", { 
        sponsor: null, 
        events: [], 
        user: req.session.user 
      });
    }
    
    const sponsor = sponsorRows[0];
    
    // Get sponsor info and events
    const sql = `
      SELECT s.SponsorID, s.Contribution, e.EventID, e.EventName, e.EventDate, e.Venue
      FROM sponsor s
      JOIN event e ON s.EventID = e.EventID
      WHERE s.SponsorID = ?
      ORDER BY e.EventDate;
    `;
    
    db.query(sql, [sponsorId], (err, sponsorEvents) => {
      if (err) return res.status(500).send("DB error");
      
      if (sponsorEvents.length === 0) {
        return res.render("sponsors/dashboard", { 
          sponsor, 
          events: [], 
          user: req.session.user 
        });
      }
    
    // For each event, get budget breakdown and expenditure details
    const eventPromises = sponsorEvents.map(event => {
      return new Promise((resolve, reject) => {
        // Get total budget and expenditure for the event
        const budgetSql = `
          SELECT 
            SUM(AllocatedAmount) AS totalBudget,
            (SELECT COALESCE(SUM(Amount), 0) FROM expenditure WHERE EventID = ?) AS totalSpent
          FROM budget
          WHERE EventID = ?
        `;
        
        db.query(budgetSql, [event.EventID, event.EventID], (err1, budgetRows) => {
          if (err1) return reject(err1);
          
          // Get budget breakdown by category
          const categorySql = `
            SELECT 
              b.Category,
              b.AllocatedAmount,
              b.BudgetExplanation,
              COALESCE(SUM(e.Amount), 0) AS Spent
            FROM budget b
            LEFT JOIN expenditure e ON e.EventID = b.EventID AND e.Category = b.Category
            WHERE b.EventID = ?
            GROUP BY b.Category, b.AllocatedAmount, b.BudgetExplanation
          `;
          
          db.query(categorySql, [event.EventID], (err2, categories) => {
            if (err2) return reject(err2);
            
            // Get detailed expenditures
            db.query("SELECT * FROM expenditure WHERE EventID = ? ORDER BY ExpenseDate DESC", [event.EventID], (err3, expenditures) => {
              if (err3) return reject(err3);
              
              const totalBudget = parseFloat(budgetRows[0]?.totalBudget || 0);
              const totalSpent = parseFloat(budgetRows[0]?.totalSpent || 0);
              const contribution = parseFloat(event.Contribution);
              
              // Calculate sponsor's contribution percentage and allocation
              const sponsorPercentage = totalBudget > 0 ? (contribution / totalBudget) * 100 : 0;
              const sponsorAllocated = categories.map(cat => ({
                category: cat.Category,
                totalAllocated: parseFloat(cat.AllocatedAmount),
                totalSpent: parseFloat(cat.Spent),
                sponsorShare: (parseFloat(cat.AllocatedAmount) * sponsorPercentage / 100).toFixed(2),
                sponsorSpent: (parseFloat(cat.Spent) * sponsorPercentage / 100).toFixed(2),
                explanation: cat.BudgetExplanation
              }));
              
              resolve({
                ...event,
                totalBudget,
                totalSpent,
                contribution,
                sponsorPercentage: sponsorPercentage.toFixed(2),
                categories: sponsorAllocated,
                expenditures: expenditures || []
              });
            });
          });
        });
      });
    });
    
      Promise.all(eventPromises).then(events => {
        res.render("sponsors/dashboard", { 
          sponsor, 
          events, 
          user: req.session.user 
        });
      }).catch(err => {
        console.error("Sponsor dashboard error:", err);
        res.status(500).send("Database error");
      });
    });
  });
});

// Sponsor view for an event (read-only)
router.get("/event/:eventId", isSponsor, (req, res) => {
  const eventId = req.params.eventId;
  const sql = `
    SELECT b.BudgetID, b.Category, b.AllocatedAmount, b.ApprovedBy, b.ApprovalDate, b.BudgetExplanation,
           (SELECT COALESCE(SUM(Amount),0) FROM expenditure e WHERE e.EventID = b.EventID AND e.Category = b.Category) AS Spent
    FROM budget b
    WHERE b.EventID = ?
  `;
  db.query(sql, [eventId], (err, budgets) => {
    if (err) return res.status(500).send("DB error");
    db.query("SELECT * FROM expenditure WHERE EventID=?", [eventId], (err2, expenditures) => {
      if (err2) return res.status(500).send("DB error");
      db.query("SELECT * FROM sponsor WHERE EventID=?", [eventId], (err3, sponsors) => {
        if (err3) return res.status(500).send("DB error");
        res.render("sponsors/event", { budgets, expenditures, sponsors, eventId });
      });
    });
  });
});

module.exports = router;
