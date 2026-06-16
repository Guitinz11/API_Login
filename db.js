const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});


(async () => {
    try {
        const conn = await connection.getConnection();
        console.log('Conectado ao MySQL com sucesso!');

        try {
            await conn.query('ALTER TABLE voltas ADD COLUMN pista INT NOT NULL DEFAULT 1');
            console.log('Coluna pista adicionada à tabela voltas.');
        } catch (migrationError) {
            if (!migrationError.message.includes('Duplicate column name') && !migrationError.message.includes('ER_DUP_FIELDNAME')) {
                console.warn('Falha ao aplicar migração de pista:', migrationError.message);
            }
        }

        conn.release();
    } catch (error) {
        console.error('Erro ao conectar ao banco:', error.message);
    }
})();

module.exports = connection;