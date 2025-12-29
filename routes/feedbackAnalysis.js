const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { MongoClient, ObjectId } = require("mongodb");
const natural = require("natural");
const { SentimentAnalyzer, PorterStemmer } = natural;

const mongoUrl = "mongodb://localhost:27017";
const mongoDBName = "myFeedbackDB";
const mongoCollection = "feedback";

// Middleware to check if user is coordinator or admin
function isCoordinatorOrAdmin(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === "coordinator" || req.session.user.role === "admin")) {
        return next();
    }
    return res.redirect("/login");
}

// Feedback Analysis Dashboard - Show all events with feedback analysis
router.get("/dashboard", isCoordinatorOrAdmin, async (req, res) => {
    const userId = req.session.user.linkedId;
    const userRole = req.session.user.role;
    
    try {
        let sql = "";
        let params = [];
        
        if (userRole === "admin") {
            // Admin can see all events in the system
            sql = `
                SELECT e.EventID, e.EventName, e.EventDate, 
                       (SELECT COUNT(*) FROM feedbackMapping WHERE EventID = e.EventID) as totalFeedback
                FROM event e
                ORDER BY e.EventDate DESC
            `;
            params = [];
        } else if (userRole === "coordinator") {
            // Connect to MongoDB to get unique event IDs that have feedback
            const client = new MongoClient(mongoUrl);
            await client.connect();
            const dbMongo = client.db(mongoDBName);
            
            // Get distinct event IDs from feedback collection
            const eventIds = await dbMongo.collection(mongoCollection)
                .distinct('eventId');
            
            await client.close();
            
            if (eventIds.length === 0) {
                // No feedback exists
                return res.render("coordinator/feedback-analysis", { 
                    events: [], 
                    user: req.session.user 
                });
            }
            
            // Create placeholders for the IN clause
            const placeholders = eventIds.map(() => '?').join(',');
            
            // Coordinator can see only events they coordinate that have feedback
            sql = `
                SELECT e.EventID, e.EventName, e.EventDate, 
                       (SELECT COUNT(*) FROM feedbackMapping WHERE EventID = e.EventID) as totalFeedback
                FROM coordinates c
                JOIN event e ON c.EventID = e.EventID
                WHERE c.MemberID = ? AND e.EventID IN (${placeholders.replace(/\?/g, '?')})
                ORDER BY e.EventDate DESC
            `;
            params = [userId, ...eventIds];
        }
        
        db.query(sql, params, (err, events) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send("Database error");
            }
            
            res.render("coordinator/feedback-analysis", { 
                events, 
                user: req.session.user 
            });
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).send("Error loading dashboard");
    }
});

// Detailed feedback analysis for a specific event
router.get("/event/:eventId", isCoordinatorOrAdmin, async (req, res) => {
    const eventId = req.params.eventId;
    
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.linkedId;
        
        // Check if user has access to this event
        if (userRole === "coordinator") {
            // Coordinator must be assigned to this event
            const accessCheckSql = "SELECT * FROM coordinates WHERE MemberID = ? AND EventID = ?";
            // Convert to integers to ensure proper comparison
            const memberId = parseInt(userId);
            const eventCheckId = parseInt(eventId);
            
            db.query(accessCheckSql, [memberId, eventCheckId], (err, results) => {
                if (err) {
                    console.error('Access check error:', err);
                    return res.status(500).send("Access check failed");
                }
                if (results.length === 0) {
                    console.log(`Access denied: Member ${memberId} is not assigned to event ${eventCheckId}`);
                    return res.status(403).send("Access denied");
                }
                
                proceedWithAnalysis();
            });
        } else if (userRole === "admin") {
            // Admin can access any event
            proceedWithAnalysis();
        }
        
        async function proceedWithAnalysis() {
            // Get all feedback mappings for this event
            const mappingSql = "SELECT MongoFeedbackKey FROM feedbackMapping WHERE EventID = ?";
            db.query(mappingSql, [eventId], async (err, mappingRows) => {
                if (err) {
                    console.error('Feedback mapping query error:', err);
                    return res.status(500).send("Database error");
                }
                
                if (mappingRows.length === 0) {
                    return res.status(404).send("No feedback found for this event");
                }
                
                // Connect to MongoDB to get feedback data based on the mapped keys
                const client = new MongoClient(mongoUrl);
                await client.connect();
                const dbMongo = client.db(mongoDBName);
                
                // Extract the feedback keys
                const feedbackKeys = mappingRows.map(row => row.MongoFeedbackKey);
                
                // Get feedback documents that match the mapped keys
                // Handle both ObjectId strings and regular string keys
                const objectIdKeys = [];
                const stringKeys = [];
                
                feedbackKeys.forEach(key => {
                    // Check if the key is a valid ObjectId format
                    if (/^[0-9a-fA-F]{24}$/.test(key)) {
                        try {
                            objectIdKeys.push(new ObjectId(key));
                        } catch (e) {
                            stringKeys.push(key); // fallback to string if invalid ObjectId
                        }
                    } else {
                        stringKeys.push(key);
                    }
                });
                
                const queryConditions = [];
                if (objectIdKeys.length > 0) {
                    queryConditions.push({ _id: { $in: objectIdKeys } });
                }
                if (stringKeys.length > 0) {
                    queryConditions.push({ _id: { $in: stringKeys } });
                }
                
                let feedbackDocs = [];
                if (queryConditions.length > 0) {
                    // Combine conditions with $or
                    const query = queryConditions.length > 1 ? { $or: queryConditions } : queryConditions[0];
                    feedbackDocs = await dbMongo.collection(mongoCollection).find(query).toArray();
                } else {
                    feedbackDocs = [];
                }
                
                await client.close();
                
                if (feedbackDocs.length === 0) {
                    return res.status(404).send("No feedback found for this event");
                }
                
                // Try to get event details from MySQL
                const eventSql = "SELECT EventName, EventDate, Venue, Budget FROM event WHERE EventID = ?";
                db.query(eventSql, [eventId], async (err, eventRows) => {
                    let event;
                    
                    if (err || eventRows.length === 0) {
                        // Event doesn't exist in MySQL, create a basic event object from feedback data
                        event = {
                            EventName: `Event #${eventId} (Deleted)`,
                            EventDate: new Date(), // Use current date as fallback
                            Venue: "Unknown",
                            Budget: "0.00",
                            EventDescription: "This event has been deleted from the system but feedback remains."
                        };
                    } else {
                        event = {
                            ...eventRows[0],
                            EventDescription: eventRows[0].Venue // Using Venue as description since there's no EventDescription field
                        };
                    }
                    
                    // Perform analysis
                    const analysis = analyzeFeedback(feedbackDocs);
                    
                    res.render("coordinator/feedback-analysis-details", { 
                        event, 
                        analysis,
                        user: req.session.user 
                    });
                });
            });
        }
    } catch (error) {
        console.error("Feedback analysis error:", error);
        res.status(500).send("Error analyzing feedback");
    }
});

// Function to analyze feedback and identify common themes
function analyzeFeedback(feedbackDocs) {
    if (!feedbackDocs || feedbackDocs.length === 0) {
        return {
            totalFeedback: 0,
            averageRating: 0,
            positiveFeedback: 0,
            negativeFeedback: 0,
            neutralFeedback: 0,
            commonIssues: [],
            improvementSuggestions: [],
            sentimentAnalysis: [],
            topKeywords: []
        };
    }
    
    // Calculate basic metrics
    const totalFeedback = feedbackDocs.length;
    const totalRating = feedbackDocs.reduce((sum, fb) => sum + parseInt(fb.rating || 0), 0);
    const averageRating = totalRating / totalFeedback;
    
    // Categorize feedback by rating
    const positiveFeedback = feedbackDocs.filter(fb => parseInt(fb.rating) >= 4).length;
    const negativeFeedback = feedbackDocs.filter(fb => parseInt(fb.rating) <= 2).length;
    const neutralFeedback = totalFeedback - positiveFeedback - negativeFeedback;
    
    // Extract and analyze comments
    const comments = feedbackDocs
        .filter(fb => fb.comments && fb.comments.trim() !== '')
        .map(fb => fb.comments.toLowerCase().trim());
    
    // Identify common issues and improvement suggestions
    const commonIssues = identifyCommonIssues(comments);
    const improvementSuggestions = identifyImprovementSuggestions(comments);
    const sentimentAnalysis = performSentimentAnalysis(feedbackDocs);
    const topKeywords = extractTopKeywords(comments);
    
    return {
        totalFeedback,
        averageRating: Math.round(averageRating * 100) / 100, // Round to 2 decimal places
        positiveFeedback,
        negativeFeedback,
        neutralFeedback,
        commonIssues,
        improvementSuggestions,
        sentimentAnalysis,
        topKeywords
    };
}

// Helper function to identify common issues from comments
function identifyCommonIssues(comments) {
    const issueCategories = {
        'Food Quality': ['food', 'meal', 'catering', 'taste', 'quality', 'menu'],
        'Venue/Location': ['venue', 'location', 'place', 'space', 'area', 'room', 'hall'],
        'Organization': ['organiz', 'arrang', 'planning', 'schedule', 'timing', 'management'],
        'Staff Behavior': ['staff', 'service', 'attitude', 'helpful', 'rude', 'friendly'],
        'Event Content': ['content', 'activity', 'program', 'entertainment', 'performance', 'show'],
        'Facilities': ['facility', 'toilet', 'parking', 'seating', 'ac', 'lighting', 'comfort'],
        'Value for Money': ['price', 'cost', 'value', 'expensive', 'cheap', 'worth', 'money'],
        'Crowd Management': ['crowd', 'queue', 'waiting', 'line', 'space', 'overcrowd']
    };
    
    const issues = {};
    
    comments.forEach(comment => {
        // Tokenize and stem the comment
        const tokenizer = new natural.WordTokenizer();
        const tokens = tokenizer.tokenize(comment.toLowerCase());
        const stemmedTokens = tokens.map(token => PorterStemmer.stem(token));
        
        // Check for each category
        for (const [category, keywords] of Object.entries(issueCategories)) {
            let issueCount = 0;
            
            // Check stemmed tokens
            for (const token of stemmedTokens) {
                if (keywords.some(keyword => token.includes(PorterStemmer.stem(keyword)))) {
                    issueCount++;
                }
            }
            
            // Also check original comment for phrases
            for (const keyword of keywords) {
                if (comment.includes(keyword)) {
                    issueCount++;
                }
            }
            
            if (issueCount > 0) {
                issues[category] = (issues[category] || 0) + issueCount;
            }
        }
    });
    
    // Sort by frequency and return top 5
    return Object.entries(issues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue, count]) => ({ issue, count }));
}

// Helper function to identify improvement suggestions
function identifyImprovementSuggestions(comments) {
    const suggestionCategories = {
        'Better Organization': ['organiz', 'arrang', 'planning', 'schedule', 'timing', 'management'],
        'Improved Food Quality': ['food', 'meal', 'catering', 'taste', 'quality', 'menu'],
        'Enhanced Facilities': ['facility', 'toilet', 'parking', 'seating', 'ac', 'lighting', 'comfort'],
        'More Activities': ['activity', 'entertainment', 'program', 'content', 'performance'],
        'Better Staff Training': ['staff', 'service', 'attitude', 'helpful', 'rude', 'friendly'],
        'Improved Value': ['price', 'cost', 'value', 'expensive', 'cheap', 'worth', 'money'],
        'Better Crowd Control': ['crowd', 'queue', 'waiting', 'line', 'space', 'overcrowd']
    };
    
    const suggestions = {};
    
    comments.forEach(comment => {
        // Tokenize and stem the comment
        const tokenizer = new natural.WordTokenizer();
        const tokens = tokenizer.tokenize(comment.toLowerCase());
        const stemmedTokens = tokens.map(token => PorterStemmer.stem(token));
        
        // Look for improvement keywords
        const improvementKeywords = ['should', 'could', 'need', 'better', 'more', 'improve', 'enhance',
                                   'add', 'change', 'different', 'alternative', 'next time'];
        
        const hasImprovementKeyword = tokens.some(token => 
            improvementKeywords.some(keyword => token.includes(keyword))
        );
        
        if (hasImprovementKeyword) {
            // Check for each category
            for (const [category, keywords] of Object.entries(suggestionCategories)) {
                let suggestionCount = 0;
                
                // Check stemmed tokens
                for (const token of stemmedTokens) {
                    if (keywords.some(keyword => token.includes(PorterStemmer.stem(keyword)))) {
                        suggestionCount++;
                    }
                }
                
                // Also check original comment for phrases
                for (const keyword of keywords) {
                    if (comment.includes(keyword)) {
                        suggestionCount++;
                    }
                }
                
                if (suggestionCount > 0) {
                    suggestions[category] = (suggestions[category] || 0) + suggestionCount;
                }
            }
        }
    });
    
    // Sort by frequency and return top 5
    return Object.entries(suggestions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([suggestion, count]) => ({ suggestion, count }));
}

// Helper function for sentiment analysis
function performSentimentAnalysis(feedbackDocs) {
    // Initialize sentiment analyzer with English language
    const analyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
    
    const sentiments = {
        positive: 0,
        negative: 0,
        neutral: 0
    };
    
    feedbackDocs.forEach(fb => {
        // Get rating-based sentiment
        const rating = parseInt(fb.rating);
        let ratingSentiment = 0;
        if (rating >= 4) {
            ratingSentiment = 1;
        } else if (rating <= 2) {
            ratingSentiment = -1;
        }
        
        // Get text-based sentiment if comment exists
        let textSentiment = 0;
        if (fb.comments && fb.comments.trim() !== '') {
            const tokenizer = new natural.WordTokenizer();
            const tokens = tokenizer.tokenize(fb.comments.toLowerCase());
            textSentiment = analyzer.getSentiment(tokens);
        }
        
        // Combine both ratings and text sentiment
        const combinedSentiment = ratingSentiment !== 0 ? ratingSentiment : Math.sign(textSentiment);
        
        if (combinedSentiment > 0) {
            sentiments.positive++;
        } else if (combinedSentiment < 0) {
            sentiments.negative++;
        } else {
            sentiments.neutral++;
        }
    });
    
    return sentiments;
}

// Helper function to extract top keywords
function extractTopKeywords(comments) {
    // Combine all comments and tokenize
    const allTokens = [];
    
    comments.forEach(comment => {
        // Tokenize and stem the comment
        const tokenizer = new natural.WordTokenizer();
        const tokens = tokenizer.tokenize(comment.toLowerCase());
        const stemmedTokens = tokens.map(token => PorterStemmer.stem(token));
        
        // Add tokens to allTokens array
        allTokens.push(...stemmedTokens);
    });
    
    // Remove common stop words and filter out short words
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'];
    
    const filteredTokens = allTokens.filter(token => 
        token.length > 3 && 
        !stopWords.includes(token) && 
        !/^[0-9]+$/.test(token) // Remove numbers
    );
    
    // Count word frequencies
    const wordCount = {};
    filteredTokens.forEach(token => {
        wordCount[token] = (wordCount[token] || 0) + 1;
    });
    
    // Sort by frequency and return top 10
    return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));
}

module.exports = router;