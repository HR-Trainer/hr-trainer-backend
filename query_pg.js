const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:sirine@localhost:5432/hr_trainer_db?schema=public'
});

async function main() {
  const res = await pool.query("SELECT id, titre, \"contenuUrl\" FROM \"Module\" WHERE \"typeContenu\" = 'DOCUMENT';");
  console.log(res.rows);
  pool.end();
}

main().catch(console.error);
