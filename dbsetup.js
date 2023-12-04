const dotenv = require("dotenv").config();
const mysql = require("mysql2");

const conn = mysql
  .createConnection({
    host: process.env.DB_HOST,
    port: process.env.PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  .promise();
const fs = require("fs").promises;
(async function () {
  let content = await fs.readFile("dbsetup.sql", { encoding: "utf-8" });
  let lines = content.split("\r\n");
  let temp = "";
  for (let line of lines) {
    line = line.trim();
    temp += line + "\r\n";
    if (line.endsWith(";")) {
      await conn.execute(temp);
      temp = "";
    }
  }
  await conn.end();
})();
