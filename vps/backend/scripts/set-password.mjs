import { pool } from "../src/db.mjs";
import { hashPassword } from "../src/password.mjs";

const username = String(process.argv[2] || "").trim().toLowerCase();
if (!username) {
  console.error("Usage: node scripts/set-password.mjs <username>");
  process.exit(2);
}

let secret = "";
for await (const chunk of process.stdin) secret += chunk;
secret = secret.replace(/[\r\n]+$/g, "");

if (secret.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(2);
}

try {
  const hash = await hashPassword(secret);
  const result = await pool.query(
    `update public.app_users
     set password_hash=$1,
         password_changed_at=now()
     where username=$2
     returning username,role,location,password_hash is not null as has_password`,
    [hash, username]
  );

  if (!result.rowCount) {
    console.error("User not found.");
    process.exitCode = 1;
  } else {
    await pool.query("delete from public.sessions where user_id=(select id from public.app_users where username=$1)", [username]);
    console.log("PASSWORD_SET_OK", result.rows[0]);
  }
} finally {
  await pool.end();
}
