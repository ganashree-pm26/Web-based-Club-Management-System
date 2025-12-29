const db = require("../config/db");
const bcrypt = require("bcrypt");

function findUserByUsername(username){
  return new Promise((resolve, reject) => {
    db.query("SELECT * FROM users WHERE Username = ?", [username], (err, rows) => {
      if(err) return reject(err);
      resolve(rows[0] || null);
    });
  });
}

function findUserById(userId){
  return new Promise((resolve, reject) => {
    db.query("SELECT * FROM users WHERE UserID = ?", [userId], (err, rows) => {
      if(err) return reject(err);
      resolve(rows[0] || null);
    });
  });
}

async function createUser({ username, password, role, linkedId = null, fullName = null }){
  const hash = await bcrypt.hash(password, 12);
  return new Promise((resolve, reject) => {
    const sql = "INSERT INTO users (Username, Password, Role, LinkedID, FullName) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [username, hash, role, linkedId, fullName], (err, result) => {
      if(err) return reject(err);
      resolve(result.insertId);
    });
  });
}

module.exports = { findUserByUsername, findUserById, createUser };