const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dit9xra.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const studentCollection = client.db('studentDB').collection('student');
    const ourStories = client.db('School_server').collection('student'); // Optional: for stories

    // 🔁 GET: All students OR filter by email
    app.get('/student', async (req, res) => {
      const email = req.query.email;

      if (email) {
        const result = await studentCollection.findOne({ email });
        res.send(result);
      } else {
        const result = await studentCollection.find().toArray();
        res.send(result);
      }
    });

    // 📝 POST: Add new student
    app.post('/student', async (req, res) => {
      const newStudent = req.body;

      // Generate 6-digit registration number
      const registrationNumber = Math.floor(100000 + Math.random() * 900000);
      newStudent.registrationNumber = registrationNumber;

      console.log('New Student Registered:', newStudent);

      const result = await studentCollection.insertOne(newStudent);

      res.send({
        acknowledged: result.acknowledged,
        insertedId: result.insertedId,
        registrationNumber,
      });
    });

    // 📚 GET: All stories (optional)
    app.get('/stories', async (req, res) => {
      const result = await ourStories.find().toArray();
      res.send(result);
    });

    // 📖 GET: Story by ID (optional)
    app.get('/stories/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ourStories.findOne(query);
      res.send(result);
    });

    // 🏠 Root route
    app.get('/', (req, res) => {
      res.send('School server is running');
    });

    // Ping MongoDB
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Connected to MongoDB!');
  } catch (err) {
    console.error('❌ Error connecting to MongoDB:', err);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
