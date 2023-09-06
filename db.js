const { Pool } = require('pg');

const pool = new Pool({
  user: 'danil',
  host: 'localhost',
  database: 'assignment_api_db',
  password: 'D213141516171_d',
  port: 5432,
});

// Function to add a course to the user's tracked list
async function addTrackedCourse(userId, courseId) {
  const client = await pool.connect();
  try {
    const query = 'UPDATE users SET tracked_courses = array_append(tracked_courses, $1) WHERE id = $2';
    await client.query(query, [courseId, userId]);
  } finally {
    client.release();
  }
}

// Function to remove a course from the user's tracked list
async function removeTrackedCourse(userId, courseId) {
  const client = await pool.connect();
  try {
    const query = 'UPDATE users SET tracked_courses = array_remove(tracked_courses, $1) WHERE id = $2';
    await client.query(query, [courseId, userId]);
  } finally {
    client.release();
  }
}

// Function to fetch the list of courses the user is tracking
async function getTrackedCourses(userId) {
  const client = await pool.connect();
  try {
    const query = 'SELECT tracked_courses FROM users WHERE id = $1';
    const result = await client.query(query, [userId]);
    return result.rows[0].tracked_courses;
  } finally {
    client.release();
  }
}

module.exports = { 
  pool, 
  addTrackedCourse, 
  removeTrackedCourse, 
  getTrackedCourses 
};


