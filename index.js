const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dit9xra.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const usersCollection = client.db('studentDB').collection('users');
    const rollUpdateCollection = client.db('studentDB').collection('studentRollUpdate');
    const ourStories = client.db('School_server').collection('student');
    const classesCollection = client.db('studentDB').collection('classes');

    // Initialize classes if not present
    const initializeClasses = async () => {
      const existingClasses = await classesCollection.countDocuments();
      if (existingClasses === 0) {
        const defaultClasses = [
          { name: 'Play Group' }, { name: 'Nursery' }, { name: 'KG-1' }, { name: 'KG-2' },
          { name: 'Class 1' }, { name: 'Class 2' }, { name: 'Class 3' }, { name: 'Class 4' },
          { name: 'Class 5' }, { name: 'Class 6' }, { name: 'Class 7' }, { name: 'Class 8' },
          { name: 'Class 9' }, { name: 'Class 10' }, { name: 'Class 11' }, { name: 'Class 12' }
        ];
        await classesCollection.insertMany(defaultClasses);
        console.log('✅ Default classes initialized');
      }
    };
    await initializeClasses();

    // STUDENTS
    app.get('/student', async (req, res) => {
      const email = req.query.email;
      if (email) {
        const student = await studentCollection.findOne({ email });
        const user = await usersCollection.findOne({ email });

        if (!student) {
          return res.status(404).send({ error: 'Student not found' });
        }

        if (user?.photoURL) {
          student.photoURL = user.photoURL;
        }

        return res.send(student);
      }

      const result = await studentCollection.find().toArray();
      res.send(result);
    });

    app.post('/student', async (req, res) => {
      const newStudent = req.body;
      const registrationNumber = Math.floor(100000 + Math.random() * 900000);
      newStudent.registrationNumber = registrationNumber;
      newStudent.photoURL = newStudent.photoURL || '';
      const result = await studentCollection.insertOne(newStudent);
      res.send({
        acknowledged: result.acknowledged,
        insertedId: result.insertedId,
        registrationNumber,
      });
    });

    app.delete('/student', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ error: 'Email required' });

        const result = await studentCollection.deleteOne({ email });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'Student not found' });
        }

        res.send({ acknowledged: true, deletedCount: result.deletedCount, message: 'Student removed successfully' });
      } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    // USERS
    app.post('/users', async (req, res) => {
      try {
        const { name, photoURL, email, password, phone } = req.body;
        if (!name || !email || !password || !phone) {
          return res.status(400).send({ error: 'Missing required fields' });
        }
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).send({ error: 'Email already registered' });
        }
        const newUser = {
          name,
          photoURL: photoURL || '',
          email,
          password,
          phone,
          role: 'user',
          createdAt: new Date(),
        };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
          message: 'User registered successfully with default role user',
        });
      } catch (error) {
        console.error('Error storing user data:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/users', async (req, res) => {
      try {
        const email = req.query.email;
        if (email) {
          const user = await usersCollection.findOne({ email });
          if (!user) {
            return res.status(404).send({ error: 'User not found' });
          }
          return res.send(user);
        }
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.patch('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const { role, assignedClasses, shift, subjects } = req.body;

        if (!role) {
          return res.status(400).send({ error: 'Role is required' });
        }

        const updateData = { role };

        if (role === 'teacher') {
          if (!assignedClasses?.length || !shift || !subjects?.length) {
            return res.status(400).send({ error: 'Assigned classes, shift, and subjects are required for teacher role' });
          }

          // Validate class IDs
          for (const cls of assignedClasses) {
            const classExists = await classesCollection.findOne({ _id: new ObjectId(cls.classId) });
            if (!classExists) {
              return res.status(404).send({ error: `Class ${cls.classId} not found` });
            }
            cls.className = classExists.name; // Ensure className is set
          }

          updateData.assignedClasses = assignedClasses;
          updateData.shift = shift;
          updateData.subjects = subjects;
        } else {
          // Clear teacher-specific fields if not a teacher
          updateData.assignedClasses = null;
          updateData.shift = null;
          updateData.subjects = null;
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'User not found' });
        }

        res.send({
          acknowledged: result.acknowledged,
          modifiedCount: result.modifiedCount,
          message: `User role updated to ${role}`,
          ...(role === 'teacher' ? { assignedClasses, shift, subjects } : {})
        });
      } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.delete('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const result = await usersCollection.deleteOne({ email });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'User not found' });
        }

        res.send({
          acknowledged: true,
          deletedCount: result.deletedCount,
          message: 'User removed successfully'
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.patch('/users/remove-class/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              role: 'user',
              assignedClasses: null,
              shift: null,
              subjects: null
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'User not found' });
        }

        res.send({
          acknowledged: result.acknowledged,
          modifiedCount: result.modifiedCount,
          message: 'User demoted and class assignment removed'
        });
      } catch (error) {
        console.error('Error removing class:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    // CLASSES
    app.get('/classes', async (req, res) => {
      try {
        const classes = await classesCollection.find().toArray();
        res.send(classes);
      } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/classes/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const classData = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!classData) return res.status(404).send({ error: 'Class not found' });
        res.send(classData);
      } catch (error) {
        console.error('Error fetching class:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    // STORIES
    app.get('/stories', async (req, res) => {
      const result = await ourStories.find().toArray();
      res.send(result);
    });

    app.get('/stories/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ourStories.findOne(query);
      res.send(result);
    });

    // STUDENT ROLL UPDATE
    app.post('/studentRollUpdate', async (req, res) => {
      try {
        const { name, email, oldRoll, newRoll, reason } = req.body;
        if (!name || !email || !oldRoll || !newRoll) {
          return res.status(400).send({ error: 'Missing required fields' });
        }

        const rollUpdate = {
          name,
          email,
          oldRoll,
          newRoll,
          reason: reason || '',
          updatedAt: new Date(),
        };

        const result = await rollUpdateCollection.insertOne(rollUpdate);
        res.status(201).send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
          message: 'Roll updated successfully',
        });
      } catch (error) {
        console.error('Error posting roll update:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/studentRollUpdate', async (req, res) => {
      try {
        const email = req.query.email;
        if (email) {
          const result = await rollUpdateCollection.findOne({ email });
          return res.send(result);
        }
        const result = await rollUpdateCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching roll updates:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    // ROOT
    app.get('/', (req, res) => {
      res.send('School server is running');
    });

    await client.db('admin').command({ ping: 1 });
    console.log(' Connected to MongoDB!');
  } catch (err) {
    console.error(' Error connecting to MongoDB:', err);
  }
}

run().then(() => {
  app.listen(port, () => {
    console.log(` Server is running on port ${port}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
});