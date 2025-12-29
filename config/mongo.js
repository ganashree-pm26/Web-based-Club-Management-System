const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/club_feedback")
.then(() => console.log("MongoDB Connected!"))
.catch(err => console.error(err));
