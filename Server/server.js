const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 5000;
const JWT_SECRET = "labsafe_enterprise_secret_key_2026";

app.use(cors());
app.use(express.json());

// Initialize SQLite DB
const db = new sqlite3.Database("./labsafe.db", (err) => {
  if (err) console.error("DB Error:", err.message);
  else console.log("Connected to SQLite Database.");
});

// Ensure Tables Exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      cabinet TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      expiryDate TEXT,
      casNumber TEXT,
      hazardNotes TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL
    )
  `);
});

// Incompatibility Matrix Definition
const INCOMPATIBILITY_RULES = {
  ACID: ["BASE"],
  BASE: ["ACID"],
  FLAMMABLE: ["OXIDIZER"],
  OXIDIZER: ["FLAMMABLE"]
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Authentication required." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired session token." });
    req.user = user;
    next();
  });
};

// Audit Helper
const logAudit = (user, action, details) => {
  db.run(
    "INSERT INTO audit_logs (user, action, details) VALUES (?, ?, ?)",
    [user, action, details],
    (err) => {
      if (err) console.error("Audit log error:", err.message);
    }
  );
};

// Login Route
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  let role = null;

  if (username === "admin" && password === "admin123") role = "ADMIN";
  else if (username === "tech" && password === "tech123") role = "TECH";

  if (!role) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = jwt.sign({ username, role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, username, role });
});

// GET Inventory
app.get("/api/inventory", (req, res) => {
  db.all("SELECT * FROM inventory", [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// POST Add Chemical Item with Incompatibility Matrix Check
app.post("/api/inventory", authenticateToken, (req, res) => {
  const { name, category, cabinet, quantity, unit, expiryDate, casNumber, hazardNotes, overrideReason } = req.body;

  if (!name || !category || !cabinet) {
    return res.status(400).json({ message: "Chemical Name, Category, and Cabinet are required." });
  }

  // Check Cabinet Safety Constraints
  db.all("SELECT category FROM inventory WHERE cabinet = ?", [cabinet], (err, existingItems) => {
    if (err) return res.status(500).json({ message: err.message });

    const forbiddenCategories = INCOMPATIBILITY_RULES[category] || [];
    const conflict = existingItems.find(item => forbiddenCategories.includes(item.category));

    if (conflict && (!overrideReason || req.user.role !== "ADMIN")) {
      return res.status(400).json({
        message: `SAFETY VIOLATION: Cannot store ${category} in ${cabinet} containing incompatible ${conflict.category}!`
      });
    }

    // Insert Item into Database
    const sql = `INSERT INTO inventory (name, category, cabinet, quantity, unit, expiryDate, casNumber, hazardNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [name, category, cabinet, quantity || 0, unit || "mL", expiryDate || "", casNumber || "", hazardNotes || ""];

    db.run(sql, params, function (err) {
      if (err) return res.status(500).json({ message: `Database error: ${err.message}` });

      const details = overrideReason 
        ? `Added ${name} (${category}) to ${cabinet} with ADMIN OVERRIDE: ${overrideReason}`
        : `Added ${name} (${category}) to ${cabinet}`;

      logAudit(req.user.username, "ADD_CHEMICAL", details);
      res.json({ id: this.lastID, name, category, cabinet, quantity, unit, expiryDate, casNumber, hazardNotes });
    });
  });
});

// PUT Move Chemical
app.put("/api/inventory/:id/move", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { targetCabinet } = req.body;

  db.get("SELECT * FROM inventory WHERE id = ?", [id], (err, item) => {
    if (err || !item) return res.status(404).json({ message: "Item not found." });

    db.all("SELECT category FROM inventory WHERE cabinet = ? AND id != ?", [targetCabinet, id], (err, existingItems) => {
      if (err) return res.status(500).json({ message: err.message });

      const forbiddenCategories = INCOMPATIBILITY_RULES[item.category] || [];
      const conflict = existingItems.find(i => forbiddenCategories.includes(i.category));

      if (conflict) {
        return res.status(400).json({
          message: `SAFETY REJECTED: Cannot move ${item.category} to ${targetCabinet} holding incompatible ${conflict.category}!`
        });
      }

      db.run("UPDATE inventory SET cabinet = ? WHERE id = ?", [targetCabinet, id], (err) => {
        if (err) return res.status(500).json({ message: err.message });

        logAudit(req.user.username, "MOVE_CHEMICAL", `Moved ${item.name} from ${item.cabinet} to ${targetCabinet}`);
        res.json({ message: "Move successful" });
      });
    });
  });
});

// DELETE Chemical Item
app.delete("/api/inventory/:id", authenticateToken, (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Only Safety Officers (ADMIN) can delete items." });
  }

  const { id } = req.params;
  db.get("SELECT name, cabinet FROM inventory WHERE id = ?", [id], (err, item) => {
    if (!item) return res.status(404).json({ message: "Item not found." });

    db.run("DELETE FROM inventory WHERE id = ?", [id], (err) => {
      if (err) return res.status(500).json({ message: err.message });

      logAudit(req.user.username, "DELETE_CHEMICAL", `Deleted ${item.name} from ${item.cabinet}`);
      res.json({ message: "Chemical deleted." });
    });
  });
});

// GET Audit Logs
app.get("/api/audit", authenticateToken, (req, res) => {
  db.all("SELECT * FROM audit_logs ORDER BY timestamp DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => console.log(`Enterprise Backend server running on port ${PORT}`));