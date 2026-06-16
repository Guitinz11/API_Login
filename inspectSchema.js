const db = require('./db');
(async () => {
  try {
    const [tables] = await db.query('SHOW TABLES');
    console.log('tables:', tables);
    const [corredores] = await db.query('SHOW COLUMNS FROM corredores');
    console.log('corredores columns:', corredores);
    const [voltas] = await db.query('SHOW COLUMNS FROM voltas');
    console.log('voltas columns:', voltas);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    process.exit();
  }
})();
