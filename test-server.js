const express = require("express");
const app = express();

app.get("/api/simple-test", (req, res) => {
  console.log("✅ SIMPLE-TEST appelé !");
  res.json({ message: "Ça marche !", timestamp: new Date() });
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Test réussi" });
});

app.listen(6001, () => {
  console.log("🎯 SERVEUR TEST sur http://localhost:6001");
  console.log("Testez: curl http://localhost:6001/api/simple-test");
});
