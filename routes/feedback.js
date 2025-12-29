const express = require("express");
const router = express.Router();
const connection = require("../config/db");
const { MongoClient } = require("mongodb");

const mongoUrl = "mongodb://localhost:27017";
const mongoDBName = "myFeedbackDB";
const mongoCollection = "feedback";

// 1️⃣ GET feedback form
router.get("/form/:eventId/:participantId", (req, res) => {
    const { eventId, participantId } = req.params;

    const sql = `
        SELECT p.ParticipantID, p.ParticipantName, p.EventID, e.EventName
        FROM participant p
        JOIN event e ON p.EventID = e.EventID
        WHERE p.ParticipantID = ? AND p.EventID = ?
    `;

    connection.query(sql, [participantId, eventId], (err, results) => {
        if (err || results.length === 0) {
            return res.render("feedback/error", { error: "Participant not found" });
        }

        const participant = results[0];
        res.render("feedback/form", { participant });
    });
});

// 2️⃣ POST submit feedback
router.post("/submit/:eventId/:participantId", async (req, res) => {
    const { eventId, participantId } = req.params;
    const { rating, comments } = req.body;

    try {
        const client = new MongoClient(mongoUrl);
        await client.connect();
        const db = client.db(mongoDBName);

        const feedbackDoc = {
            eventId: Number(eventId),
            participantId: Number(participantId),
            rating,
            comments,
            submittedAt: new Date()
        };

        const mongoResult = await db.collection(mongoCollection).insertOne(feedbackDoc);
        await client.close();

        const mongoKey = mongoResult.insertedId.toString();

        const sql = `
            INSERT INTO feedbackMapping (EventID, ParticipantID, MongoFeedbackKey)
            VALUES (?, ?, ?)
        `;

        connection.query(sql, [eventId, participantId, mongoKey], (err) => {
            if (err) {
                return res.render("feedback/error", { error: err });
            }
            res.render("feedback/success", { message: "Feedback submitted successfully!" });
        });

    } catch (error) {
        res.render("feedback/error", { error });
    }
});

module.exports = router;
