require('dotenv').config()

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')

const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())

// PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

// Authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      message: 'Authentication required',
    })
  }

  try {
    const user = jwt.verify(
      token,
      process.env.JWT_SECRET
    )

    req.user = user
    next()
  } catch {
    return res.status(403).json({
      message: 'Invalid or expired token',
    })
  }
}

// ======================================================
// HEALTH
// ======================================================

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()')

    res.json({
      status: 'ok',
      databaseTime: result.rows[0].now,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: 'Database connection failed',
    })
  }
})

// ======================================================
// LOGIN
// ======================================================

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({
      message: 'Username and password are required',
    })
  }

  try {
    const result = await pool.query(
      `
      SELECT id, username, password_hash
      FROM users
      WHERE username = $1
      `,
      [username]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid username or password',
      })
    }

    const user = result.rows[0]

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    )

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid username or password',
      })
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '8h',
      }
    )

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: 'Server error',
    })
  }
})

// ======================================================
// KNOWLEDGE
// ======================================================

// Get Knowledge
app.get(
  '/api/knowledge',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM knowledge_entries
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [req.user.userId]
      )

      res.json(result.rows)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Create Knowledge
app.post(
  '/api/knowledge',
  authenticateToken,
  async (req, res) => {
    const {
      title,
      content,
      collection,
      tags,
    } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Title is required',
      })
    }

    try {
      const result = await pool.query(
        `
        INSERT INTO knowledge_entries
        (
          user_id,
          title,
          content,
          collection,
          tags
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          req.user.userId,
          title.trim(),
          content || null,
          collection || null,
          Array.isArray(tags) ? tags : [],
        ]
      )

      res.status(201).json(result.rows[0])
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Update Knowledge
app.put(
  '/api/knowledge/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params

    const {
      title,
      content,
      collection,
      tags,
    } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Title is required',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE knowledge_entries
        SET
          title = $1,
          content = $2,
          collection = $3,
          tags = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        AND user_id = $6
        RETURNING *
        `,
        [
          title.trim(),
          content || null,
          collection || null,
          Array.isArray(tags) ? tags : [],
          id,
          req.user.userId,
        ]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Knowledge entry not found',
        })
      }

      res.json(result.rows[0])
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Delete Knowledge
app.delete(
  '/api/knowledge/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params

    try {
      const result = await pool.query(
        `
        DELETE FROM knowledge_entries
        WHERE id = $1
        AND user_id = $2
        RETURNING id
        `,
        [id, req.user.userId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Knowledge entry not found',
        })
      }

      res.json({
        message: 'Knowledge entry deleted',
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// ======================================================
// RESEARCH LATER
// ======================================================

// Get Research
app.get(
  '/api/research',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM research_entries
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [req.user.userId]
      )

      res.json(result.rows)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Create Research
app.post(
  '/api/research',
  authenticateToken,
  async (req, res) => {
    const {
      title,
      notes,
      tags,
    } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Title is required',
      })
    }

    try {
      const result = await pool.query(
        `
        INSERT INTO research_entries
        (
          user_id,
          title,
          notes,
          tags
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          req.user.userId,
          title.trim(),
          notes || null,
          Array.isArray(tags) ? tags : [],
        ]
      )

      res.status(201).json(result.rows[0])
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Update Research
app.put(
  '/api/research/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params

    const {
      title,
      notes,
      tags,
    } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Title is required',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE research_entries
        SET
          title = $1,
          notes = $2,
          tags = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        AND user_id = $5
        RETURNING *
        `,
        [
          title.trim(),
          notes || null,
          Array.isArray(tags) ? tags : [],
          id,
          req.user.userId,
        ]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Research entry not found',
        })
      }

      res.json(result.rows[0])
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// Delete Research
app.delete(
  '/api/research/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params

    try {
      const result = await pool.query(
        `
        DELETE FROM research_entries
        WHERE id = $1
        AND user_id = $2
        RETURNING id
        `,
        [id, req.user.userId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Research entry not found',
        })
      }

      res.json({
        message: 'Research entry deleted',
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    }
  }
)

// ======================================================
// COMPLETE RESEARCH -> KNOWLEDGE
// ======================================================

app.post(
  '/api/research/:id/complete',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params

    const {
      title,
      content,
      collection,
      tags,
    } = req.body

    if (
      !title ||
      !title.trim() ||
      !content ||
      !content.trim()
    ) {
      return res.status(400).json({
        message: 'Title and content are required',
      })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Make sure this Research entry belongs
      // to the logged-in user.
      const researchResult = await client.query(
        `
        SELECT id
        FROM research_entries
        WHERE id = $1
        AND user_id = $2
        FOR UPDATE
        `,
        [id, req.user.userId]
      )

      if (researchResult.rows.length === 0) {
        await client.query('ROLLBACK')

        return res.status(404).json({
          message: 'Research entry not found',
        })
      }

      // Create the Knowledge entry.
      const knowledgeResult = await client.query(
        `
        INSERT INTO knowledge_entries
        (
          user_id,
          title,
          content,
          collection,
          tags
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          req.user.userId,
          title.trim(),
          content.trim(),
          collection || null,
          Array.isArray(tags) ? tags : [],
        ]
      )

      // Remove the completed Research entry.
      await client.query(
        `
        DELETE FROM research_entries
        WHERE id = $1
        AND user_id = $2
        `,
        [id, req.user.userId]
      )

      await client.query('COMMIT')

      res.json({
        message: 'Research completed',
        knowledge: knowledgeResult.rows[0],
      })
    } catch (error) {
      await client.query('ROLLBACK')

      console.error(error)

      res.status(500).json({
        message: 'Server error',
      })
    } finally {
      client.release()
    }
  }
)

// ======================================================
// SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(
    `kNow backend running at http://localhost:${PORT}`
  )
})