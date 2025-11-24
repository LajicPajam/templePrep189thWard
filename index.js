/*
Author: Jared Achee
Description: Temple Prep Class website for LDS ward
*/

const express = require("express");
const app = express();

// --- MIDDLEWARE ---
app.set("view engine", "ejs");
app.use(express.static("public"));

// --- HOME PAGE ---
app.get("/", (req, res) => {
  res.render("index");
});

// --- LESSONS PAGE ---
app.get("/lessons", (req, res) => {
  res.render("lessons");
});

// --- RECOMMENDED BOOKS PAGE ---
app.get("/books", (req, res) => {
  res.render("books");
});

// --- CONTACT PAGE ---
app.get("/contact", (req, res) => {
  res.render("contact");
});

// --- PORT ---
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Temple Prep Class website running on port ${port}`)
);