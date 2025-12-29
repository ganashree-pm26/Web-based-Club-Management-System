const db = require('../config/db');

// Create income table to track revenue from participants, sponsors, etc.
const createIncomeTable = `
CREATE TABLE IF NOT EXISTS income (
  IncomeID INT AUTO_INCREMENT PRIMARY KEY,
  EventID INT,
  SourceType ENUM('participant', 'sponsor', 'other') NOT NULL,
  SourceID INT,  -- ID of the source (ParticipantID, SponsorID, etc.)
  Category VARCHAR(100),
  Amount DECIMAL(10,2) NOT NULL,
  IncomeDate DATE,
  Description TEXT,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (EventID) REFERENCES event(EventID)
);
`;

db.query(createIncomeTable, (err, result) => {
  if (err) {
    console.error('Error creating income table:', err);
    process.exit(1);
  }
  
  console.log('Income table created successfully!');
  
  // Now add a trigger to automatically record participant fees as income
  const createTrigger = `
  CREATE TRIGGER IF NOT EXISTS record_participant_income 
  AFTER UPDATE ON participant
  FOR EACH ROW
  BEGIN
    IF NEW.AmountPaid > 0 AND NEW.AmountPaid > COALESCE((SELECT SUM(Amount) FROM income WHERE SourceType = 'participant' AND SourceID = NEW.ParticipantID), 0) THEN
      INSERT INTO income (EventID, SourceType, SourceID, Category, Amount, IncomeDate, Description)
      VALUES (NEW.EventID, 'participant', NEW.ParticipantID, 'Registration Fee', NEW.AmountPaid - COALESCE((SELECT SUM(Amount) FROM income WHERE SourceType = 'participant' AND SourceID = NEW.ParticipantID), 0), NEW.RegDate, CONCAT('Registration fee for participant ', NEW.ParticipantName));
    END IF;
  END;
  `;
  
  db.query(createTrigger, (err, result) => {
    if (err) {
      console.error('Error creating trigger:', err);
      // This is not critical, so we continue
    } else {
      console.log('Income tracking trigger created successfully!');
    }
    
    process.exit(0);
  });
});