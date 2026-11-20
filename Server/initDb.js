const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function setupDatabase() {
  const db = await open({
    filename: './labsafe.db',
    driver: sqlite3.Database
  });

  console.log('Setting up database tables...');

  // Create Cabinets Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS storage_cabinets (
      cabinet_id INTEGER PRIMARY KEY AUTOINCREMENT,
      cabinet_name TEXT NOT NULL,
      storage_type TEXT NOT NULL
    );
  `);

  // Create Chemical Inventory Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chemical_inventory (
      chemical_id INTEGER PRIMARY KEY AUTOINCREMENT,
      chemical_name TEXT NOT NULL,
      chemical_class TEXT NOT NULL,
      quantity_ml INTEGER NOT NULL,
      cabinet_id INTEGER,
      FOREIGN KEY (cabinet_id) REFERENCES storage_cabinets(cabinet_id)
    );
  `);

  // Create Safety Rules Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS compatibility_rules (
      class_a TEXT,
      class_b TEXT,
      hazard TEXT
    );
  `);

  // Populate default cabinet & safety rule if empty
  const cabinets = await db.all('SELECT * FROM storage_cabinets');
  if (cabinets.length === 0) {
    await db.run(`INSERT INTO storage_cabinets (cabinet_name, storage_type) VALUES ('Main Cabinet #1', 'GENERAL')`);
    await db.run(`INSERT INTO compatibility_rules (class_a, class_b, hazard) VALUES ('ACID', 'BASE', 'EXOTHERMIC REACTION - EXPLOSION RISK')`);
    console.log('Seeded initial cabinet and safety rule!');
  }

  console.log('Database setup complete! "labsafe.db" file created.');
}

setupDatabase().catch(err => console.error('Database setup error:', err));