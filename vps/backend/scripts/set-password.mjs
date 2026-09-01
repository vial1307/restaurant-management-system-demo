import { pool } from "../src/db.mjs";
import { hashPassword } from "../src/password.mjs";

const username = String(process.argv[2] || "").trim().toLowerCase();
if (!username) {
  console.error("Usage: node scripts/set-password.mjs <username>");
  process.exit(2);
}

let secret = "";
for await (const chunk of process.stdin) secret += chunk;

// stdin can include the terminal line ending; strip only CR/LF, not spaces.
secret = secret.replace(/[\r\n]+$/g, "");

if (secret.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(2);
}

try {
  const hash = await hashPassword(secret);
  const result = await pool.query(
    \`update public.app_users
     set password_hash=$1,password_changed_at=now()
     where username=$2
     returning username,role,location\`,
    [hash, username]
  );
  if (!result.rowCount) {
    console.error("User not found.");
    process.exitCode = 1;
  } else {
    console.log("Password set:", result.rows[0]);
  }
} finally {
  await pool.end();
}
