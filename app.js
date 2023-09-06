// Import required modules
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AWS = require('aws-sdk');
const multer = require('multer');
const fs = require('fs');

// Create an instance of the Express application
const app = express();

// Set up middleware to parse JSON request bodies
app.use(express.json());

// Set up multer to handle file uploads
const upload = multer({ dest: 'uploads/' });

// Import database functions
const { addTrackedCourse, removeTrackedCourse, getTrackedCourses } = require('./db');

// Set the secret key for JWT token generation
const SECRET = process.env.MY_SECRET_KEY;

// AWS Configuration
configureAWS();

// POST endpoints
app.post('/api/assignments/:id/attach', upload.single('file'), uploadAssignment); // Attach a file to an assignment
app.post('/api/users/login', loginUser); // Log in a user
app.post('/api/users/create', createUser); // Create a new user
app.post('/api/users/:userId/verify', verifyUser); // Verify a user's email address
app.post('/api/courses', createCourse); // Create a new course
app.post('/api/assignments', createAssignment); // Create a new assignment
app.post('/api/users/:userId/track_course/:courseId', trackCourse); // Track a course for a user
app.post('/api/users/:userId/untrack_course/:courseId', untrackCourse); // Untrack a course for a user

// GET endpoints
app.get('/api/users', getAllUsers); // Get all users
app.get('/api/users/verified', getVerifiedUsers); // Get all verified users
app.get('/api/users/unverified', getUnverifiedUsers); // Get all unverified users
app.get('/api/courses', getAllCourses); // Get all courses
app.get('/api/assignments', getAllAssignments); // Get all assignments
app.get('/api/users/:userId/tracked_courses', getTrackedCoursesForUser); // Get all tracked courses for a user

// PUT endpoints
app.put('/api/courses/:id', updateCourse); // Update a course
app.put('/api/assignments/:id', updateAssignment); // Update an assignment

// DELETE endpoints
app.delete('/api/courses/:id', deleteCourse); // Delete a course
app.delete('/api/assignments/:id', deleteAssignment); // Delete an assignment

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
/**
 * Uploads an assignment to the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The newly created assignment.
 */
async function uploadAssignment(req, res) {
  // Destructure the required properties from the request body.
  const { title, description, due_date, course_id } = req.body;

  // Insert the assignment into the database and return the newly created assignment.
  try {
    const result = await db.query(
      'INSERT INTO assignments (title, description, due_date, course_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, due_date, course_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to upload assignment to database.' });
  }
}

/**
 * Logs in a user and returns a JWT token.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A JWT token.
 */
async function loginUser(req, res) {
  // Destructure the required properties from the request body.
  const { email, password } = req.body;

  // Find the user with the given email.
  const user = users.find(u => u.email === email);

  // If the user doesn't exist, return a 404 status code and a clear error message.
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Check if the password is valid.
  const passwordIsValid = bcrypt.compareSync(password, user.password);

  // If the password is invalid, return a 401 status code and a clear error message.
  if (!passwordIsValid) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  // If the user exists and the password is valid, create a JWT token and return it.
  const token = jwt.sign({ id: user.id, verified: user.verified }, SECRET, {
    expiresIn: 86400 // expires in 24 hours
  });

  res.status(200).json({ auth: true, token });
}

/**
 * Creates a new user and inserts it into the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The newly created user.
 */
async function createUser(req, res) {
  // Destructure the required properties from the request body.
  const { email, password } = req.body;

  // Check if email already exists in the database.
  try {
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists.' });
    }

    // Hash the password.
    const passwordHash = bcrypt.hashSync(password, 8);

    // Insert the user into the database and return the newly created user.
    const result = await db.query(
      'INSERT INTO users (email, password_hash, verified) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to create user.' });
  }
}

/**
 * Verifies a user's account by setting their verified status to true.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A success message.
 */
async function verifyUser(req, res) {
  const { userId } = req.params;

  // Fetch the user from the database to see if they exist.
  try {
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update the verified status.
    await db.query('UPDATE users SET verified = true WHERE id = $1', [userId]);

    res.status(200).json({ message: 'User verified successfully.' });
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to verify user.' });
  }
}

/**
 * Creates a new course and inserts it into the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The newly created course.
 */
async function createCourse(req, res) {
  const { name, description, instructor } = req.body;

  // Insert the course into the database and return the newly created course.
  try {
    const result = await db.query(
      'INSERT INTO courses (name, description, instructor) VALUES ($1, $2, $3) RETURNING *',
      [name, description, instructor]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to create course.' });
  }
}

/**
 * Creates a new assignment and inserts it into the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The newly created assignment.
 */
async function createAssignment(req, res) {
  // Destructure the required properties from the request body.
  const { title, description, due_date, course_id } = req.body;

  // Insert the assignment into the database and return the newly created assignment.
  try {
    const result = await db.query(
      'INSERT INTO assignments (title, description, due_date, course_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, due_date, course_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to create assignment.' });
  }
}

/**
 * Adds a course to a user's tracked list.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A success message.
 */
async function trackCourse(req, res) {
  const userId = req.params.userId;
  const courseId = req.params.courseId;

  // Fetch the user from the database to see if they exist.
  try {
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Add the course to the user's tracked list.
    await addTrackedCourse(userId, courseId);

    res.status(200).json({ message: 'Course added to tracked list.' });
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to add course to tracked list.' });
  }
}

/**
 * Removes a course from a user's tracked list.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A success message.
 */
async function untrackCourse(req, res) {
  const userId = req.params.userId;
  const courseId = req.params.courseId;

  // Fetch the user from the database to see if they exist.
  try {
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Remove the course from the user's tracked list.
    await removeTrackedCourse(userId, courseId);

    res.status(200).json({ message: 'Course removed from tracked list.' });
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to remove course from tracked list.' });
  }
}

/**
 * Fetches all users from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of users.
 */
async function getAllUsers(req, res) {
  try {
    const result = await db.query('SELECT * FROM users');
    res.status(200).json(result.rows);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

/**
 * Fetches all verified users from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of verified users.
 */
async function getVerifiedUsers(req, res) {
  try {
    const result = await db.query('SELECT * FROM users WHERE verified=true');
    res.status(200).json(result.rows);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch verified users.' });
  }
}

/**
 * Fetches all unverified users from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of unverified users.
 */
async function getUnverifiedUsers(req, res) {
  try {
    const result = await db.query('SELECT * FROM users WHERE verified=false');
    res.status(200).json(result.rows);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch unverified users.' });
  }
}

/**
 * Fetches all courses from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of courses.
 */
async function getAllCourses(req, res) {
  try {
    const result = await db.query('SELECT * FROM courses');
    res.status(200).json(result.rows);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
}

/**
 * Fetches all assignments from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of assignments.
 */
async function getAllAssignments(req, res) {
  try {
    const result = await db.query('SELECT * FROM assignments');
    res.status(200).json(result.rows);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
}

/**
 * Fetches all tracked courses for a given user.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An array of tracked courses.
 */
async function getTrackedCoursesForUser(req, res) {
  const userId = req.params.userId;

  // Fetch the user from the database to see if they exist.
  try {
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Fetch the tracked courses for the user.
    const courses = await getTrackedCourses(userId);

    res.status(200).json(courses);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to fetch tracked courses.' });
  }
}

/**
 * Updates a course in the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The updated course.
 */
async function updateCourse(req, res) {
  const { id } = req.params;
  const { name, description, instructor } = req.body;

  // Update the course in the database and return the updated course.
  try {
    const result = await db.query(
      'UPDATE courses SET name = $1, description = $2, instructor = $3 WHERE id = $4 RETURNING *',
      [name, description, instructor, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to update course.' });
  }
}

/**
 * Updates an assignment in the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The updated assignment.
 */
async function updateAssignment(req, res) {
  const { id } = req.params;
  const { title, description, due_date, course_id } = req.body;

  // Update the assignment in the database and return the updated assignment.
  try {
    const result = await db.query(
      'UPDATE assignments SET title = $1, description = $2, due_date = $3, course_id = $4 WHERE id = $5 RETURNING *',
      [title, description, due_date, course_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to update assignment.' });
  }
}

/**
 * Deletes a course from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A success message.
 */
async function deleteCourse(req, res) {
  const { id } = req.params;

  // Delete the course from the database.
  try {
    const result = await db.query('DELETE FROM courses WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    res.status(204).send();
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to delete course.' });
  }
}

/**
 * Deletes an assignment from the database.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} A success message.
 */
async function deleteAssignment(req, res) {
  const { id } = req.params;

  // Delete the assignment from the database.
  try {
    const result = await db.query('DELETE FROM assignments WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    res.status(204).send();
  } catch (err) {
    // If there's an error, return a 500 status code and a clear error message.
    res.status(500).json({ error: 'Failed to delete assignment.' });
  }
}
