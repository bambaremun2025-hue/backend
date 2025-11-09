const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://bambaremun2025_db_user:cLJpmC3knrEUQ40k@cluster0.rlglyd0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Ping réussi ! Connecté à MongoDB !");
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
