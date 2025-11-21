/*
Author: Jared Achee
Description: Quote Wall website with login + role-based access
*/

require("dotenv").config();
const express = require("express");
const knex = require("knex");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const ConnectSessionKnex = require("connect-session-knex");
const KnexSessionStore = ConnectSessionKnex(session);

const app = express();

// --- DATABASE CONNECTION ---
const db = knex({
  client: "pg",
  connection: {
    host: process.env.RDS_HOSTNAME || "localhost",
    user: process.env.RDS_USERNAME || "postgres",
    password: process.env.RDS_PASSWORD || "admin",
    database: process.env.RDS_DB_NAME || "usersdb",
    port: process.env.RDS_PORT || 5432,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
});

// --- AUTO-CREATE TABLES ON STARTUP ---
async function setupDatabase() {
  try {
    // Check and create users table
    const hasUsersTable = await db.schema.hasTable("users");
    if (!hasUsersTable) {
      await db.schema.createTable("users", (table) => {
        table.increments("id").primary();
        table.string("username").notNullable();
        table.string("email").unique().notNullable();
        table.string("password").notNullable();
        table.string("role").defaultTo("user");
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
    }

    // Check and create likes table
    const hasLikesTable = await db.schema.hasTable("likes");
    if (!hasLikesTable) {
    await db.schema.createTable("likes", (table) => {
        table.increments("id").primary();
        table.integer("user_id").notNullable();
        table.integer("quote_id").notNullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.unique(["user_id", "quote_id"]); // prevents duplicate likes
    });
    }

    // Check and create quotes table
    const hasQuotesTable = await db.schema.hasTable("quotes");
    if (!hasQuotesTable) {
      await db.schema.createTable("quotes", (table) => {
        table.increments("id").primary();
        table.text("quote").notNullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
    }

    // Check and create sessions table
    const hasSessionsTable = await db.schema.hasTable("sessions");
    if (!hasSessionsTable) {
      await db.schema.createTable("sessions", (table) => {
        table.string("sid").primary();
        table.json("sess").notNullable();
        table.timestamp("expire", { precision: 6 }).notNullable();
      });
    }

    console.log("✅ Database tables ready");
  } catch (err) {
    console.error("Error setting up tables:", err);
  }
}



setupDatabase();

// --- SESSIONS ---
const store = new KnexSessionStore({
  knex: db,
  tablename: "sessions",
  createtable: true
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

// --- MIDDLEWARE ---
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --- AUTH CHECK HELPERS ---
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin")
    return res.status(403).send("Admin access only");
  next();
}

function requireEditorOrAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== "admin" && req.session.user.role !== "editor"))
    return res.status(403).send("Editor or Admin access required");
  next();
}

// --- HOME PAGE ---
app.get("/", requireLogin, async (req, res) => {
  const searchName = req.query.search || '';
  const sortOrder = req.query.sort || 'newest'; // Default to newest
  
  // Determine sort direction
  const orderDirection = sortOrder === 'oldest' ? 'asc' : 'desc';
  
    let quotes = await db("quotes")
    .leftJoin("likes", "quotes.id", "likes.quote_id")
    .groupBy("quotes.id")
    .select(
        "quotes.*",
        db.raw("COUNT(likes.id) AS like_count")
    )
    .orderBy("created_at", orderDirection);
  
  if (searchName) {
    const trimmedSearch = searchName.trim().toLowerCase();
    quotes = quotes.filter(q => {
      const lines = q.quote.split('\n');
      return lines.some(line => {
        const parts = line.split(':');
        if (parts.length > 1) {
          const speaker = parts[0].trim().toLowerCase();
          return speaker.includes(trimmedSearch);
        }
        return false;
      });
    });
  }
  
  res.render("index", { quotes, user: req.session.user, searchName, sortOrder });
});

// LIKE a quote
app.post("/like/:id", requireLogin, async (req, res) => {
  const quoteId = req.params.id;
  const userId = req.session.user.id;

  const existing = await db("likes")
    .where({ user_id: userId, quote_id: quoteId })
    .first();

  if (existing) {
    await db("likes").where("id", existing.id).del();
  } else {
    await db("likes").insert({ user_id: userId, quote_id: quoteId });
  }

  res.redirect("/");
});

app.post("/like/:id", requireLogin, async (req, res) => {
  const quoteId = req.params.id;
  const userId = req.session.user.id;

  const existing = await db("likes")
    .where({ user_id: userId, quote_id: quoteId })
    .first();

  if (existing) {
    await db("likes").where("id", existing.id).del();
  } else {
    await db("likes").insert({ user_id: userId, quote_id: quoteId });
  }

  res.redirect("/");
});

// --- ADD QUOTE PAGE (Editor or Admin only) ---
app.get("/add", requireEditorOrAdmin, (req, res) => {
  res.render("add", { user: req.session.user, lastQuote: null, success: false });
});

// --- ADD QUOTE (Editor or Admin only) ---
app.post("/add", requireEditorOrAdmin, async (req, res) => {
  const { names, quotes } = req.body;

  const fullQuote = names.map((name, i) => `${name.trim()}: ${quotes[i].trim()}`).join('\n');

  const [newQuote] = await db("quotes").insert({ quote: fullQuote }).returning("*");
  
  res.render("add", { user: req.session.user, lastQuote: newQuote, success: true });
});

// --- DELETE QUOTE (Editor or Admin only) ---
app.post("/delete/:id", requireEditorOrAdmin, async (req, res) => {
  await db("quotes").where("id", req.params.id).del();
  res.redirect("/");
});

// --- EDIT QUOTE PAGE (Admin only) ---
app.get("/edit/:id", requireAdmin, async (req, res) => {
  const quote = await db("quotes").where("id", req.params.id).first();
  
  if (!quote) {
    return res.status(404).send("Quote not found");
  }
  
  // Parse the quote into lines for editing
  const lines = quote.quote.split('\n').map(line => {
    const parts = line.split(':');
    return {
      name: parts[0].trim(),
      text: parts.slice(1).join(':').trim()
    };
  });
  
  res.render("edit", { quote, lines, user: req.session.user });
});

// --- UPDATE QUOTE (Admin only) ---
app.post("/edit/:id", requireAdmin, async (req, res) => {
  const { names, quotes } = req.body;
  
  const fullQuote = names.map((name, i) => `${name.trim()}: ${quotes[i].trim()}`).join('\n');
  
  await db("quotes").where("id", req.params.id).update({ quote: fullQuote });
  
  res.redirect("/");
});

// --- USERS MANAGEMENT PAGE (Admin only) ---
app.get("/users", requireAdmin, async (req, res) => {
  const users = await db("users").select("*").orderBy("created_at", "desc");
  res.render("users", { users, user: req.session.user });
});

// --- UPDATE USER ROLE (Admin only) ---
app.post("/users/:id/role", requireAdmin, async (req, res) => {
  const { role } = req.body;
  await db("users").where("id", req.params.id).update({ role });
  res.redirect("/users");
});

// --- DELETE USER (Admin only) ---
app.post("/users/:id/delete", requireAdmin, async (req, res) => {
  const userId = req.params.id;
  
  // Prevent deleting yourself
  if (parseInt(userId) === req.session.user.id) {
    return res.status(400).send("You cannot delete your own account");
  }
  
  await db("users").where("id", userId).del();
  res.redirect("/users");
});

// --- UPDATE USER INFO (Admin only) ---
app.post("/users/:id/update", requireAdmin, async (req, res) => {
  const { username, email } = req.body;
  await db("users").where("id", req.params.id).update({ username, email });
  res.redirect("/users");
});


// --- LOGIN ---
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await db("users").where({ email }).first();
  if (!user) return res.send("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.send("Invalid credentials");

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  res.redirect("/");
});

// --- REGISTER ---
app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  const existing = await db("users").where({ email }).first();
  if (existing) return res.send("Email already exists");

  const hashed = await bcrypt.hash(password, 10);

  await db("users").insert({
    username,
    email,
    password: hashed,
    role: "user",
    created_at: db.fn.now(),
  });

  res.redirect("/login");
});

// --- LOGOUT ---
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// --- PORT ---
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Quote Wall running on port ${port}`)
);
