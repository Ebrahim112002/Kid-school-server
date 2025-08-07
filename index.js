const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

const privateKey = process.env.FIREBASE_PRIVATE_KEY;

admin.initializeApp({
  credential: admin.credential.cert({
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
  }),
});

app.use(cors({ origin: 'https://school-project-472e4.web.app', credentials: true }));
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
    const allClassSubject = client.db('School_server').collection('subject');
    const AllTeachers = client.db('School_server').collection('Teacher');
    const classesCollection = client.db('studentDB').collection('classes');
    const pendingStudentsCollection = client.db('studentDB').collection('pendingStudents');
    const noticesCollection = client.db('studentDB').collection('notices');

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

    // Initialize sample stories if not present
    const initializeStories = async () => {
      const existingStories = await ourStories.countDocuments();
      if (existingStories === 0) {
        const sampleStories = [
          { title: 'School Annual Day', content: 'Celebrating achievements...', createdAt: new Date() },
          { title: 'Science Fair 2025', content: 'Students showcased innovative projects...', createdAt: new Date() },
        ];
        await ourStories.insertMany(sampleStories);
        console.log('✅ Sample stories initialized');
      }
    };

    // Initialize sample notices if not present
    const initializeNotices = async () => {
      const existingNotices = await noticesCollection.countDocuments();
      if (existingNotices === 0) {
        const sampleNotices = [
          {
            title: 'Welcome Back to School',
            content: 'We are excited to start the new academic year...',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            title: 'Parent-Teacher Meeting',
            content: 'Scheduled for next Friday at 3 PM...',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        await noticesCollection.insertMany(sampleNotices);
        console.log('✅ Sample notices initialized');
      }
    };

    await initializeClasses();
    await initializeStories();
    await initializeNotices();

    // Login endpoint to verify Firebase token and fetch user data
    app.post('/login', async (req, res) => {
      try {
        const { idToken } = req.body;
        if (!idToken) {
          return res.status(400).send({ error: 'ID token is required' });
        }
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const email = decodedToken.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: 'User not found in database' });
        }
        res.send(user);
      } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    // Get current user data
    app.get('/users/me', async (req, res) => {
      try {
        const email = req.headers['x-user-email'] || req.query.email;
        if (!email) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }
        res.send(user);
      } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    });

    // Post user
    app.post('/users', async (req, res) => {
      try {
        const { name, photoURL, email, phone, role, createdAt } = req.body;
        console.log('Received payload:', req.body);

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
          return res.status(400).send({ error: 'Invalid or missing name: must be a string with at least 2 characters' });
        }
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          return res.status(400).send({ error: 'Invalid or missing email' });
        }
        if (!phone || typeof phone !== 'string' || !/^[0-9]{10,13}$/.test(phone)) {
          return res.status(400).send({ error: 'Invalid or missing phone: must be a 10-13 digit number' });
        }

        // Check if user exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          console.log('Existing user found:', existingUser);
          return res.status(200).send(existingUser);
        }

        const newUser = {
          name: name.trim(),
          photoURL: photoURL || '',
          email: email.trim(),
          phone: phone.trim(),
          role: role || 'user',
          createdAt: createdAt || new Date(),
        };
        console.log('Inserting user:', newUser);

        const result = await usersCollection.insertOne(newUser);
        const insertedUser = await usersCollection.findOne({ _id: result.insertedId });
        console.log('Stored user in MongoDB:', insertedUser);

        res.status(201).send({
          ...insertedUser,
          message: 'User registered successfully',
        });
      } catch (error) {
        console.error('Error storing user data:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/users', async (req, res) => {
      try {
        const email = req.query.email;
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;

        if (email) {
          const user = await usersCollection.findOne({ email });
          if (!user) {
            return res.status(404).send({ error: 'User not found' });
          }
          return res.send(user);
        }

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const requester = await usersCollection.findOne({ email: requesterEmail });
        if (!requester || requester.role !== 'admin') {
          return res.status(403).send({ error: 'Access denied. Admin only.' });
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
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;
        const { name, phone, photoURL, role, shift, subjects, assignedClasses, classTime } = req.body;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || (email !== requesterEmail && user.role !== 'admin')) {
          return res.status(403).send({ error: 'Unauthorized: You can only update your own profile or admin access required' });
        }

        const updateData = {};
        if (name && typeof name === 'string' && name.length >= 2) {
          updateData.name = name;
        }
        if (phone && /^[0-9]{10,13}$/.test(phone)) {
          updateData.phone = phone;
        }
        if (photoURL && typeof photoURL === 'string' && photoURL.match(/^https?:\/\/.*\.(?:png|jpg|jpeg|gif)$/i)) {
          updateData.photoURL = photoURL;
        }

        if (user.role === 'admin' && role) {
          if (!['user', 'teacher', 'admin', 'student'].includes(role)) {
            return res.status(400).send({ error: 'Invalid role' });
          }
          updateData.role = role;

          if (role === 'teacher') {
            if (!shift || !['Morning', 'Afternoon'].includes(shift)) {
              return res.status(400).send({ error: 'Shift is required and must be Morning or Afternoon' });
            }
            updateData.shift = shift;

            if (!subjects || !Array.isArray(subjects) || !subjects.every(s => 
              s.classId && typeof s.classId === 'string' && 
              s.className && typeof s.className === 'string' && 
              Array.isArray(s.subjects) && s.subjects.every(sub => typeof sub === 'string' && sub.length > 0) &&
              s.roomNumber && typeof s.roomNumber === 'string' && s.roomNumber.length > 0 &&
              s.classTime && typeof s.classTime === 'string' && s.classTime.length > 0
            )) {
              return res.status(400).send({ error: 'Invalid subjects provided: must be an array of objects with classId, className, non-empty subjects array, roomNumber, and classTime' });
            }
            updateData.subjects = subjects;

            if (!assignedClasses || !Array.isArray(assignedClasses) || !assignedClasses.every(c => c.classId && c.className)) {
              return res.status(400).send({ error: 'Invalid assignedClasses provided: must be an array of objects with classId and className' });
            }
            for (const cls of assignedClasses) {
              const classExists = await classesCollection.findOne({ _id: new ObjectId(cls.classId) });
              if (!classExists) {
                return res.status(400).send({ error: `Invalid classId: ${cls.classId}` });
              }
            }
            updateData.assignedClasses = assignedClasses;
          } else {
            // Clear teacher-specific fields if not a teacher
            updateData.shift = null;
            updateData.subjects = null;
            updateData.assignedClasses = null;
            updateData.classTime = null;
          }
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).send({ error: 'No valid fields provided for update' });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'User not found' });
        }

        if (updateData.name || updateData.phone || updateData.photoURL) {
          const studentUpdateData = {};
          if (updateData.name) studentUpdateData.name = updateData.name;
          if (updateData.phone) studentUpdateData.phone = updateData.phone;
          if (updateData.photoURL) studentUpdateData.photoURL = updateData.photoURL;
          await studentCollection.updateOne(
            { email },
            { $set: studentUpdateData }
          );
        }

        res.send({
          acknowledged: result.acknowledged,
          modifiedCount: result.modifiedCount,
          message: 'User updated successfully',
        });
      } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.delete('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || user.role !== 'admin') {
          return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        const result = await usersCollection.deleteOne({ email });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'User not found' });
        }

        await studentCollection.deleteOne({ email });

        res.send({
          acknowledged: true,
          deletedCount: result.deletedCount,
          message: 'User removed successfully',
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/classes', async (req, res) => {
      try {
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;
        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || !['admin', 'teacher'].includes(user.role)) {
          return res.status(403).send({ error: 'Access denied. Admin or teacher only.' });
        }

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
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;
        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || !['admin', 'teacher'].includes(user.role)) {
          return res.status(403).send({ error: 'Access denied. Admin or teacher only.' });
        }

        const classData = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!classData) return res.status(404).send({ error: 'Class not found' });
        res.send(classData);
      } catch (error) {
        console.error('Error fetching class:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/subjects', async (req, res) => {
      try {
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;
        const className = req.query.className;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }

        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }

        let query = {};
        if (className && user.role === 'student') {
          const student = await studentCollection.findOne({ email: requesterEmail });
          if (!student || student.className !== className) {
            return res.status(403).send({ error: 'Access denied. Students can only fetch subjects for their own class' });
          }
          query.className = className;
        } else if (className && !['admin', 'teacher'].includes(user.role)) {
          return res.status(403).send({ error: 'Access denied. Only admins or teachers can filter subjects by className' });
        } else if (className) {
          query.className = className;
        }

        const subjects = await allClassSubject.find(query).toArray();
        if (subjects.length === 0) {
          return res.status(404).send({ error: 'No subjects found for the specified class' });
        }

        res.send(subjects);
      } catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/teacher', async (req, res) => {
      try {
        const teachers = await AllTeachers.find().toArray();
        if (teachers.length === 0) {
          return res.status(404).send({ error: 'No teachers found' });
        }
        res.send(teachers);
      } catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/teacher/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await AllTeachers.findOne(query);
        if (!result) return res.status(404).send({ error: 'Teacher not found' });
        res.send(result);
      } catch (error) {
        console.error('Error fetching teacher:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/stories', async (req, res) => {
      try {
        const stories = await ourStories.find().toArray();
        if (stories.length === 0) {
          return res.status(404).send({ error: 'No stories found' });
        }
        res.send(stories);
      } catch (error) {
        console.error('Error fetching stories:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/stories/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ourStories.findOne(query);
        if (!result) return res.status(404).send({ error: 'Story not found' });
        res.send(result);
      } catch (error) {
        console.error('Error fetching story:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.post('/stories', async (req, res) => {
      try {
        const { title, content } = req.body;
        if (!title || !content) {
          return res.status(400).send({ error: 'Title and content are required' });
        }
        const newStory = {
          title,
          content,
          createdAt: new Date(),
        };
        const result = await ourStories.insertOne(newStory);
        res.status(201).send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
          message: 'Story created successfully',
        });
      } catch (error) {
        console.error('Error creating story:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.post('/notices', async (req, res) => {
      try {
        const { title, content } = req.body;
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || user.role !== 'admin') {
          return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        if (!title || !content || typeof title !== 'string' || typeof content !== 'string') {
          return res.status(400).send({ error: 'Title and content are required and must be strings' });
        }

        const newNotice = {
          title: title.trim(),
          content: content.trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await noticesCollection.insertOne(newNotice);
        res.status(201).send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
          message: 'Notice created successfully',
        });
      } catch (error) {
        console.error('Error creating notice:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/notices', async (req, res) => {
      try {
        const notices = await noticesCollection.find().sort({ createdAt: -1 }).toArray();
        if (notices.length === 0) {
          return res.status(404).send({ error: 'No notices found' });
        }
        res.send(notices);
      } catch (error) {
        console.error('Error fetching notices:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/notices/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const notice = await noticesCollection.findOne(query);
        if (!notice) {
          return res.status(404).send({ error: 'Notice not found' });
        }
        res.send(notice);
      } catch (error) {
        console.error('Error fetching notice:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.patch('/notices/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;
        const { title, content } = req.body;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || user.role !== 'admin') {
          return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        if (!title || !content || typeof title !== 'string' || typeof content !== 'string') {
          return res.status(400).send({ error: 'Title and content are required and must be strings' });
        }

        const updateData = {
          title: title.trim(),
          content: content.trim(),
          updatedAt: new Date(),
        };

        const result = await noticesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'Notice not found' });
        }

        res.send({
          acknowledged: result.acknowledged,
          modifiedCount: result.modifiedCount,
          message: 'Notice updated successfully',
        });
      } catch (error) {
        console.error('Error updating notice:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.delete('/notices/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const requesterEmail = req.headers['x-user-email'] || req.query.requesterEmail;

        if (!requesterEmail) {
          return res.status(401).send({ error: 'Authentication required' });
        }
        const user = await usersCollection.findOne({ email: requesterEmail });
        if (!user || user.role !== 'admin') {
          return res.status(403).send({ error: 'Access denied. Admin only.' });
        }

        const result = await noticesCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'Notice not found' });
        }

        res.send({
          acknowledged: true,
          deletedCount: result.deletedCount,
          message: 'Notice deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting notice:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

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
          if (!result) return res.status(404).send({ error: 'Roll update not found' });
          return res.send(result);
        }
        const result = await rollUpdateCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching roll updates:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/', (req, res) => {
      res.send('School server is running');
    });

    await client.db('admin').command({ ping: 1 });
    console.log('Connected to MongoDB!');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  }
}

run().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
});