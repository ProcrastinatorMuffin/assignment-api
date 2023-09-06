require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db').pool;
const AWS = require('aws-sdk');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const { addTrackedCourse, removeTrackedCourse, getTrackedCourses } = require('./db');
const SECRET = process.env.MY_SECRET_KEY;

// AWS Configuration
configureAWS();

// API Routes
app.post('/api/assignments/:id/attach', upload.single('file'), uploadAssignment);
app.post('/api/users/login', loginUser);
app.post('/api/users/create', createUser);
app.post('/api/users/:userId/verify', verifyUser);
app.post('/api/courses', createCourse);
app.post('/api/assignments', createAssignment);
app.post('/api/users/:userId/track_course/:courseId', trackCourse);
app.post('/api/users/:userId/untrack_course/:courseId', untrackCourse);

app.get('/api/users', getAllUsers);
app.get('/api/users/verified', getVerifiedUsers);
app.get('/api/users/unverified', getUnverifiedUsers);
app.get('/api/courses', getAllCourses);
app.get('/api/assignments', getAllAssignments);
app.get('/api/users/:userId/tracked_courses', getTrackedCoursesForUser);

app.put('/api/courses/:id', updateCourse);
app.put('/api/assignments/:id', updateAssignment);

app.delete('/api/courses/:id', deleteCourse);
app.delete('/api/assignments/:id', deleteAssignment);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// AWS Configuration Function
function configureAWS() {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-central-1'
  });
}

// Route Handlers
async function uploadAssignment(req, res) {
  const { title, description, due_date, course_id } = req.body;
  const result = await db.query(
    'INSERT INTO assignments (title, description, due_date, course_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, due_date, course_id]
  );
  res.status(201).json(result.rows[0]);
}

async function loginUser(req, res) {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user) return res.status(404).send('User not found');
  
  const passwordIsValid = bcrypt.compareSync(password, user.password);
  
  if (!passwordIsValid) return res.status(401).send('Invalid password');
  
  const token = jwt.sign({ id: user.id, verified: user.verified }, SECRET, {
    expiresIn: 86400 // expires in 24 hours
  });

  res.status(200).send({ auth: true, token });
}

async function createUser(req, res) {
  const { email, password } = req.body;

  // Check if email already exists
  const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    return res.status(400).send({ message: 'Email already exists' });
  }

  // Hash the password
  const passwordHash = bcrypt.hashSync(password, 8);

  // Insert into database
  const result = await db.query(
    'INSERT INTO users (email, password_hash, verified) VALUES ($1, $2, $3) RETURNING *',
    [email, passwordHash, false]
  );

  res.status(201).json(result.rows[0]);
}

async function verifyUser(req, res) {
  const { userId } = req.params;

  // Fetch the user from the database to see if they exist
  const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (existingUser.rows.length === 0) {
    return res.status(404).send({ message: 'User not found' });
  }

  // Update the verified status
  await db.query('UPDATE users SET verified = true WHERE id = $1', [userId]);

  res.status(200).send({ message: 'User verified successfully' });
}

async function createCourse(req, res) {
  const { name, description, instructor } = req.body;

  // Insert into database
  const result = await db.query(
    'INSERT INTO courses (name, description, instructor) VALUES ($1, $2, $3) RETURNING *',
    [name, description, instructor]
  );

  res.status(201).json(result.rows[0]);
}

async function createAssignment(req, res) {
  const { title, description, due_date, course_id } = req.body;
  const result = await db.query(
    'INSERT INTO assignments (title, description, due_date, course_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, due_date, course_id]
  );
  res.status(201).json(result.rows[0]);
}

async function trackCourse(req, res) {
  const userId = req.params.userId;
  const courseId = req.params.courseId;

  // Fetch the user from the database to see if they exist
  const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (existingUser.rows.length === 0) {
    return res.status(404).send({ message: 'User not found' });
  }

  await addTrackedCourse(userId, courseId);  // Use your db helper function
  res.status(200).send({ message: 'Course added to tracked list' });
}

async function untrackCourse(req, res) {
  const userId = req.params.userId;
  const courseId = req.params.courseId;

  // Fetch the user from the database to see if they exist
  const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (existingUser.rows.length === 0) {
    return res.status(404).send({ message: 'User not found' });
  }

  await removeTrackedCourse(userId, courseId);  // Use your db helper function
  res.status(200).send({ message: 'Course removed from tracked list' });
}

async function getAllUsers(req, res) {
  const result = await db.query('SELECT * FROM users');
  res.status(200).json(result.rows);
}

async function getVerifiedUsers(req, res) {
  const result = await db.query('SELECT * FROM users WHERE verified=true');
  res.status(200).json(result.rows);
}

async function getUnverifiedUsers(req, res) {
  const result = await db.query('SELECT * FROM users WHERE verified=false');
  res.status(200).json(result.rows);
}

async function getAllCourses(req, res) {
  const result = await db.query('SELECT * FROM courses');
  res.status(200).json(result.rows);
}

async function getAllAssignments(req, res) {
  const result = await db.query('SELECT * FROM assignments');
  res.status(200).json(result.rows);
}

async function getTrackedCoursesForUser(req, res) {
  const userId = req.params.userId;

  // Fetch the user from the database to see if they exist
  const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (existingUser.rows.length === 0) {
    return res.status(404).send({ message: 'User not found' });
  }

  const courses = await getTrackedCourses(userId);  // Use your db helper function
  res.status(200).send(courses);
}

async function updateCourse(req, res) {
  const { id } = req.params;
  const { name, description, instructor } = req.body;
  const result = await db.query(
    'UPDATE courses SET name = $1, description = $2, instructor = $3 WHERE id = $4 RETURNING *',
    [name, description, instructor, id]
  );
  res.status(200).json(result.rows[0]);
}

async function updateAssignment(req, res) {
  const { id } = req.params;
  const { title, description, due_date, course_id } = req.body;
  const result = await db.query(
    'UPDATE assignments SET title = $1, description = $2, due_date = $3, course_id = $4 WHERE id = $5 RETURNING *',
    [title, description, due_date, course_id, id]
  );
  res.status(200).json(result.rows[0]);
}

async function deleteCourse(req, res) {
  const { id } = req.params;
  await db.query('DELETE FROM courses WHERE id = $1', [id]);
  res.status(204).send();
}

async function deleteAssignment(req, res) {
  const { id } = req.params;
  await db.query('DELETE FROM assignments WHERE id = $1', [id]);
  res.status(204).send();
}
