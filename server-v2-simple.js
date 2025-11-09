const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

let users = [];
let nextId = 1;

// ✅ CETTE ROUTE EXISTE
app.get("/api/simple-test", (req, res) => {
  console.log("✅ TEST SIMPLE appelé");
  res.json({ 
    status: "ok", 
    message: "Serveur V2 accessible", 
    timestamp: new Date(),
    usersCount: users.length
  });
});

app.get("/api/test", (req, res) => {
  res.json({ message: "API V2", timestamp: new Date() });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    console.log("📝 INSCRIPTION:", req.body);
    const { username, email, password } = req.body;
    const user = { 
      id: "user_" + nextId++, 
      username, 
      email, 
      subscription: "free",
      createdAt: new Date() 
    };
    users.push(user);
    const token = jwt.sign({ userId: user.id }, "secret");
    res.json({ 
      success: true, 
      message: "Compte créé", 
      token, 
      user: { id: user.id, username, email, subscription: "free" }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

app.get("/api/admin/stats", (req, res) => {
  res.json({ 
    success: true, 
    stats: { 
      totalUsers: users.length,
      newUsersToday: users.length, // Simplifié pour tester
      message: "Stats réelles"
    } 
  });
});

app.listen(6001, () => {
  console.log("=" .repeat(40));
  console.log("🚀 SERVEUR V2 sur http://localhost:6001");
  console.log("✅ /api/simple-test - Test simple");
  console.log("✅ /api/auth/register - Inscription");
  console.log("✅ /api/admin/stats - Statistiques");
  console.log("=" .repeat(40));
});
