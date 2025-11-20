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
    await db.schema.createTableIfNotExists("users", (table) => {
      table.increments("id").primary();
      table.string("username").notNullable();
      table.string("email").unique().notNullable();
      table.string("password").notNullable();
      table.string("role").defaultTo("user");
      table.timestamp("created_at").defaultTo(db.fn.now());
    });

    await db.schema.createTableIfNotExists("quotes", (table) => {
      table.increments("id").primary();
      table.text("quote").notNullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });

    // ADD THIS:
    await db.schema.createTableIfNotExists("sessions", (table) => {
      table.string("sid").primary();
      table.json("sess").notNullable();
      table.timestamp("expire", { precision: 6 }).notNullable();
    });

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
    return res.status(403).send("Admins only");
  next();
}

// --- HOME PAGE ---
app.get("/", requireLogin, async (req, res) => {
  const quotes = await db("quotes").select("*").orderBy("id", "desc");
  res.render("index", { quotes, user: req.session.user });
});

// --- ADD QUOTE ---
app.post("/add", requireLogin, async (req, res) => {
  const { names, quotes } = req.body; // arrays

  // Combine each line as "Name: Quote"
  const fullQuote = names.map((name, i) => `${name}: ${quotes[i]}`).join('\n');

  await db("quotes").insert({ quote: fullQuote });
  res.redirect("/");
});

// --- DELETE QUOTE (Admin only) ---
app.post("/delete/:id", requireAdmin, async (req, res) => {
  await db("quotes").where("id", req.params.id).del();
  res.redirect("/");
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
