const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'finance.db');

async function runMigration() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      console.log('🔧 Running AIBudget Schema Migration...');

      db.serialize(() => {
        // Check if columns already exist
        db.all("PRAGMA table_info(analytics)", (err, columns) => {
          if (err) {
            reject(err);
            return;
          }

          const columnNames = columns.map(col => col.name);
          const columnsToAdd = [];

          // Define new columns needed for AIBudget
          const newColumns = {
            'country': 'TEXT',
            'atc': 'INTEGER DEFAULT 0',
            'ic': 'INTEGER DEFAULT 0',
            'frequency': 'REAL DEFAULT 0',
            'adset_name': 'TEXT',
            'adset_id': 'TEXT',
            'effective_status': 'TEXT',
            'budget_remaining': 'REAL DEFAULT 0'
          };

          // Check which columns need to be added
          for (const [colName, colType] of Object.entries(newColumns)) {
            if (!columnNames.includes(colName)) {
              columnsToAdd.push({ name: colName, type: colType });
            }
          }

          if (columnsToAdd.length === 0) {
            console.log('✅ All columns already exist. No migration needed.');
            db.close();
            resolve();
            return;
          }

          console.log(`📊 Adding ${columnsToAdd.length} new columns to analytics table...`);

          // Add each column
          let completed = 0;
          columnsToAdd.forEach(col => {
            const sql = `ALTER TABLE analytics ADD COLUMN ${col.name} ${col.type}`;
            db.run(sql, (err) => {
              if (err) {
                console.error(`❌ Error adding column ${col.name}:`, err);
                reject(err);
                return;
              }

              console.log(`✅ Added column: ${col.name}`);
              completed++;

              if (completed === columnsToAdd.length) {
                console.log('🎉 Migration completed successfully!');
                
                // Create index for country for faster geo queries
                db.run('CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics(country)', (err) => {
                  if (err) {
                    console.error('Warning: Could not create country index:', err);
                  }
                  
                  db.close();
                  resolve();
                });
              }
            });
          });
        });
      });
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };

