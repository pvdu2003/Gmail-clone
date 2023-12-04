"use strict";
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const dotenv = require("dotenv").config();
const mysql = require("mysql2");
const { generateKey } = require("crypto");
const conn = mysql
  .createConnection({
    host: process.env.DB_HOST,
    port: process.env.PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  .promise();
const app = express();
app.use(cookieParser());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
let list = [];
let user = [];
// sign in page
app.get("/", (req, res) => {
  res.render("pages/home");
});
// sign in page
app.post("/", async (req, res) => {
  let formType = req.body.formType;
  let email = req.body.email;
  let password = req.body.password;
  let err = {};

  if (formType === "sign-in") {
    if (email === undefined || email === "")
      err.email = "Please enter your email";
    if (password === undefined || password === "") {
      err.password = "Please enter your password";
    }
    let query = "select * from users where email = ? and pw =?";
    let [rows] = await conn.query(query, [email, password]);
    if (Object.keys(err).length === 0) {
      if (rows.length > 0) {
        res.cookie("user", rows[0].id, { maxAge: 900000 });
        res.redirect("/inbox");
      } else {
        err.overall = "Cannot sign in!";
        res.render("pages/home", { err });
      }
    }
  } else {
    res.redirect("/signUp");
  }
});
// sign up page
app.get("/signUp", (req, res) => {
  res.render("pages/signup");
});
app.post("/signUp", async (req, res) => {
  let formType = req.body.formType;
  if (formType === "sign-in") {
    res.redirect("/");
  } else {
    let { fname, email, password, confirmPw } = req.body;
    let successMsg = undefined;
    let err = {};
    if (fname === undefined || fname === "") {
      err.fname = "Please enter your full name!";
    }
    if (email === undefined || email === "") {
      err.email = "Please enter your email!";
    } else {
      let query = "select * from users where email = ?";
      let [rows] = await conn.query(query, email);
      if (rows.length > 0) {
        err.email = "This email has already used!";
      }
    }
    if (password === undefined || password.length < 6) {
      err.password = "Please enter a valid password!";
    }
    if (confirmPw !== password) {
      err.confirmPw = "Please re-enter the password correctly!";
    }
    if (Object.keys(err).length === 0) {
      let sql = "insert into users (fullname,email, pw) values (?, ?, ?)";
      let [rows] = await conn.query(sql, [fname, email, password]);
      res.render("pages/welcome");
    } else {
      res.render("pages/signup", {
        err: err,
        params: req.body,
      });
    }
  }
});

//inbox page
app.get("/inbox", async (req, res) => {
  let uID = req.cookies.user;
  if (uID === undefined || uID === "") {
    res.status(403).send("Access Denied!");
    return;
  } else {
    uID = Number(uID);
  }
  [user] = await conn.query("Select * from users where id = ?", uID);
  if (user.length > 0) {
    const pageSize = 5;
    const pageNum = Number(req.query.page) || 1;
    const offset = (pageNum - 1) * pageSize;
    const [msg] = await conn.query(
      `Select messages.id as "id", fullname, email_subject, email_body, date_format(created_at, '%b %d') as 'date' from messages
       inner join users on messages.sender_id = users.id where receiver_id = ? order by created_at DESC limit ?,?`,
      [uID, offset, pageSize]
    );
    res.render("pages/inbox", {
      user: user[0],
      msgs: msg,
    });
  } else {
    res.status(500).send("Cannot find user");
    return;
  }
});
// inbox/detail
app.get("/inbox/detail/:id", async (req, res) => {
  let uID = req.cookies.user;
  let rowId = req.params.id;
  if (uID === undefined || uID === "") {
    res.status(403).send("Access Denied!");
    return;
  } else {
    uID = Number(uID);
  }
  [user] = await conn.query("Select * from users where id = ?", uID);

  const [detail] = await conn.query(
    `Select messages.*, date_format(created_at, '%H:%i %a, %b %d') as 'date', fullname, email 
    from messages inner join users on users.id = messages.sender_id where messages.id = ?`,
    rowId
  );
  res.render("pages/detail", { user: user[0], msgs: detail[0] });
});

// compose
app.get("/compose", async (req, res) => {
  let uID = req.cookies.user;
  if (uID === undefined || uID === "") {
    res.status(403).send("Access Denied!");
    return;
  } else {
    uID = Number(uID);
  }
  [user] = await conn.query("Select * from users where id = ?", uID);
  if (user.length > 0) {
    [list] = await conn.query(
      "Select id, fullname from users where id != ?",
      uID
    );
    res.render("pages/compose", { user: user[0], lists: list });
  }
});

app.post(
  "/compose",
  multer({ dest: "temp/" }).array("attachment", 10000),
  async (req, res) => {
    let err = {};
    let uID = req.cookies.user;
    [user] = await conn.query("Select * from users where id = ?", uID);
    let { recipient, subject, body } = req.body;
    if (recipient === undefined || recipient === "") {
      err.recipient = "Please select the recipient!";
    }
    if (Object.keys(err).length === 0) {
      const fs = require("fs");
      const path = require("path");
      let attachment = Object.values(req.files)
        .map((file) => file.originalname)
        .join(";");
      req.files.forEach((file) => {
        const originalName = file.originalname;
        const filePath = path.join("temp", file.filename);
        const newFilePath = path.join("temp", originalName);
        try {
          fs.rename(filePath, newFilePath, (err) => {
            if (!err) {
              file.filename = originalName;
              file.path = newFilePath;
            }
          });
        } catch (err) {
          res.status(400).send("Error when renaming file!");
        }
      });
      let rows = conn.query(
        "Insert into messages (sender_id, receiver_id, email_subject, email_body, attachment, created_at) values (?,?,?,?,?,CURRENT_TIMESTAMP)",
        [uID, recipient, subject, body, attachment]
      );
      res.redirect("/inbox");
    } else {
      res.render("pages/compose", { err: err, user: user[0], lists: list });
    }
  }
);

app.get("/download", function (req, res) {
  const fileName = req.query.filename;
  res.download(__dirname + "/temp/" + fileName, function (err) {
    if (err) {
      res.status(500).send("Error while downloading the file");
      return;
    }
  });
});

// outbox
app.get("/outbox", async (req, res) => {
  let uID = req.cookies.user;
  if (uID === undefined || uID === "") {
    res.status(403).send("Access Denied!");
    return;
  } else {
    uID = Number(uID);
  }
  [user] = await conn.query("Select * from users where id = ?", uID);
  if (user.length > 0) {
    const pageSize = 5;
    const pageNum = Number(req.query.page) || 1;
    const offset = (pageNum - 1) * pageSize;
    const [msg] = await conn.query(
      `Select messages.id as "id", fullname, email_subject, email_body, date_format(created_at, '%b %d') as 'date' from messages
       inner join users on messages.receiver_id = users.id where sender_id = ? order by created_at DESC limit ?,?`,
      [uID, offset, pageSize]
    );
    res.render("pages/outbox", {
      user: user[0],
      msgs: msg,
    });
  } else {
    res.status(500).send("Cannot find user");
    return;
  }
});
// outbox/detail
app.get("/outbox/detail/:id", async (req, res) => {
  let uID = req.cookies.user;
  let rowId = req.params.id;
  if (uID === undefined || uID === "") {
    res.status(403).send("Access Denied!");
    return;
  } else {
    uID = Number(uID);
  }
  [user] = await conn.query("Select * from users where id = ?", uID);

  const [detail] = await conn.query(
    `Select messages.*, date_format(created_at, '%H:%i %a, %b %d') as 'date', fullname, email
    from messages inner join users on users.id = messages.receiver_id where messages.id = ?`,
    rowId
  );
  res.render("pages/detail", {
    user: user[0],
    msgs: detail[0],
  });
});

app.listen(8000);
