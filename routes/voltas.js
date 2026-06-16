const express = require('express');
const router = express.Router();
const db = require('../db');

const sseClients = [];

function broadcastSSE(event, payload) {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(client => client.write(message));
}

router.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 10000\n\n');

    sseClients.push(res);
    req.on('close', () => {
        const index = sseClients.indexOf(res);
        if (index !== -1) {
            sseClients.splice(index, 1);
        }
    });
});

// 🔹 FUNÇÃO AUXILIAR
function isValidId(id) {
    return id && !isNaN(id);
}


// LISTAR VOLTAS
router.get('/', async (req, res) => {
    const { corredor_id } = req.query;

    if (corredor_id && !isValidId(corredor_id)) {
        return res.status(400).json({ erro: 'corredor_id deve ser numérico' });
    }

    try {
        const baseQuery = `
            SELECT 
                v.id,
                v.tempo,
                v.data,
                v.pista,
                c.id_corredores AS id_corredor,
                c.nome,
                c.turma,
                c.equipe
            FROM voltas v
            JOIN corredores c ON v.corredor_id = c.id_corredores
            ${corredor_id ? 'WHERE v.corredor_id = ?' : ''}
            ORDER BY v.data DESC
        `;

        const [rows] = corredor_id
            ? await db.query(baseQuery, [corredor_id])
            : await db.query(baseQuery);

        res.json(rows || []);
    } catch (error) {
        console.error('Erro ao listar voltas:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// CRIAR VOLTA
router.post('/', async (req, res) => {
    const { corredor_id, tempo, data, pista } = req.body;

    if (!corredor_id || !tempo) {
        return res.status(400).json({ erro: 'corredor_id e tempo são obrigatórios' });
    }

    if (!isValidId(corredor_id)) {
        return res.status(400).json({ erro: 'corredor_id deve ser numérico' });
    }

    const tempoNumber = Number(tempo);
    if (Number.isNaN(tempoNumber) || tempoNumber <= 0) {
        return res.status(400).json({ erro: 'tempo deve ser um número positivo' });
    }

    const pistaNumber = pista !== undefined ? Number(pista) : 1;
    if (Number.isNaN(pistaNumber) || pistaNumber < 1 || pistaNumber > 8) {
        return res.status(400).json({ erro: 'pista deve ser um número entre 1 e 8' });
    }

    try {
        const [corredorRows] = await db.query('SELECT id_corredores FROM corredores WHERE id_corredores = ?', [corredor_id]);
        if (!corredorRows || corredorRows.length === 0) {
            return res.status(404).json({ erro: 'Corredor não encontrado' });
        }

        const dateValue = data ? new Date(data) : new Date();
        if (Number.isNaN(dateValue.getTime())) {
            return res.status(400).json({ erro: 'data inválida' });
        }

        const formattedDate = dateValue.toISOString().slice(0, 19).replace('T', ' ');
        const [result] = await db.query(
            'INSERT INTO voltas (corredor_id, tempo, data, pista) VALUES (?, ?, ?, ?)',
            [corredor_id, tempoNumber, formattedDate, pistaNumber]
        );

        const createdVolta = {
            id: result.insertId,
            corredor_id,
            tempo: tempoNumber,
            data: formattedDate,
            pista: pistaNumber
        };

        broadcastSSE('nova_volta', createdVolta);
        res.status(201).json(createdVolta);
    } catch (error) {
        console.error('Erro ao criar volta:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// LIMPAR TODAS AS VOLTAS
router.delete('/limpar', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM voltas');
        broadcastSSE('voltas_limpar', { deletedRows: result.affectedRows });
        res.json({ message: 'Todas as voltas foram removidas', deletedRows: result.affectedRows });
    } catch (error) {
        console.error('Erro ao limpar voltas:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// DELETAR VOLTA
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ erro: 'id deve ser numérico' });
    }

    try {
        const [result] = await db.query('DELETE FROM voltas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ erro: 'Volta não encontrada' });
        }

        broadcastSSE('volta_deletada', { id: Number(id) });
        res.json({ message: 'Volta removida com sucesso', deletedId: Number(id) });
    } catch (error) {
        console.error('Erro ao deletar volta:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// CONTAGEM POR CORREDOR
router.get('/contagem/:id_corredor', async (req, res) => {
    const { id_corredor } = req.params;

    if (!isValidId(id_corredor)) {
        return res.status(400).json({ erro: 'id_corredor deve ser numérico' });
    }

    try {
        const [rows] = await db.query(`
            SELECT 
                c.id_corredores AS id_corredor,
                c.nome,
                c.turma,
                c.equipe,
                COUNT(v.id) AS total_voltas
            FROM corredores c
            LEFT JOIN voltas v ON v.corredor_id = c.id_corredores
            WHERE c.id_corredores = ?
            GROUP BY c.id_corredores, c.nome, c.turma, c.equipe
        `, [id_corredor]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ erro: 'Corredor não encontrado' });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error('Erro ao contar voltas:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});


// =========================
// CONTAGEM GERAL
// =========================
router.get('/contagem', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS total_voltas FROM voltas
        `);

        if (!rows || rows.length === 0) {
            return res.json({ total_voltas: 0 });
        }

        res.json({ total_voltas: rows[0].total_voltas });

    } catch (error) {
        console.error('Erro ao contar voltas:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});



// MELHOR VOLTA GERAL

router.get('/melhor-volta-geral', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                v.tempo, 
                v.data, 
                c.id_corredores AS id_corredor, 
                c.nome, 
                c.turma,
                c.equipe
            FROM voltas v
            JOIN corredores c ON v.corredor_id = c.id_corredores
            ORDER BY v.tempo ASC
            LIMIT 1
        `);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhuma volta registrada' });
        }

        const r = rows[0];

        res.json({
            melhor_volta: r.tempo,
            data: r.data,
            corredor: {
                id: r.id_corredor,
                nome: r.nome,
                turma: r.turma,
                equipe: r.equipe
            }
        });

    } catch (error) {
        console.error('Erro melhor volta geral:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});



// MELHOR VOLTA POR CORREDOR
router.get('/melhor/:id_corredor', async (req, res) => {
    const { id_corredor } = req.params;

    if (!isValidId(id_corredor)) {
        return res.status(400).json({ erro: 'id_corredor deve ser numérico' });
    }

    try {
        const [rows] = await db.query(`
            SELECT 
                v.tempo, 
                v.data, 
                c.id_corredores AS id_corredor, 
                c.nome, 
                c.turma,
                c.equipe
            FROM voltas v
            JOIN corredores c ON v.corredor_id = c.id_corredores
            WHERE c.id_corredores = ?
            ORDER BY v.tempo ASC
            LIMIT 1
        `, [id_corredor]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhuma volta encontrada para este corredor' });
        }

        const r = rows[0];

        res.json({
            id_corredor,
            melhor_volta: r.tempo,
            data: r.data,
            corredor: {
                nome: r.nome,
                turma: r.turma,
                equipe: r.equipe
            }
        });

    } catch (error) {
        console.error('Erro melhor volta corredor:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});



// TOP 5 MELHORES VOLTAS
router.get('/top5-melhores-voltas', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                c.id_corredores AS id_corredor,
                c.nome,
                c.turma,
                c.equipe,
                v.tempo,
                v.data
            FROM voltas v
            JOIN corredores c ON v.corredor_id = c.id_corredores
            ORDER BY v.tempo ASC
            LIMIT 5
        `);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhuma volta registrada' });
        }

        const ranking = rows.map((row, index) => ({
            rank: index + 1,
            id_corredor: row.id_corredor,
            nome: row.nome,
            turma: row.turma,
            equipe: row.equipe,
            tempo: row.tempo,
            data: row.data
        }));

        res.json({ ranking });

    } catch (error) {
        console.error('Erro top 5:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});



// RANKING GERAL
router.get('/ranking', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                c.id_corredores AS id_corredor,
                c.nome,
                c.turma,
                c.equipe,
                COUNT(v.id) AS total_voltas,
                SUM(v.tempo) AS tempo_total,
                AVG(v.tempo) AS media,
                MIN(v.tempo) AS melhor_volta
            FROM corredores c
            LEFT JOIN voltas v ON v.corredor_id = c.id_corredores
            GROUP BY c.id_corredores, c.nome, c.turma, c.equipe
            ORDER BY
                CASE WHEN SUM(v.tempo) IS NULL THEN 1 ELSE 0 END,
                SUM(v.tempo) ASC,
                MIN(v.tempo) ASC
        `);

        const ranking = rows.map((row, index) => ({
            rank: index + 1,
            id_corredor: row.id_corredor,
            nome: row.nome,
            turma: row.turma,
            equipe: row.equipe,
            total_voltas: row.total_voltas,
            tempo_total: Number(row.tempo_total || 0),
            media: Number(row.media || 0),
            melhor_volta: row.melhor_volta
        }));

        res.json({ ranking });

    } catch (error) {
        console.error('Erro ranking:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// RESUMO DE PISTAS
router.get('/summary', async (req, res) => {
    try {
        const [tracks] = await db.query(`
            SELECT
                v.pista,
                COUNT(v.id) AS total_voltas,
                COALESCE(SUM(v.tempo), 0) AS tempo_total,
                COALESCE(AVG(v.tempo), 0) AS media
            FROM voltas v
            GROUP BY v.pista
            ORDER BY v.pista ASC
        `);

        const [overall] = await db.query(`
            SELECT
                COUNT(id) AS total_voltas,
                COALESCE(SUM(tempo), 0) AS tempo_total
            FROM voltas
        `);

        res.json({
            total_voltas: overall[0]?.total_voltas || 0,
            tempo_total: Number(overall[0]?.tempo_total || 0),
            tracks: tracks.map(track => ({
                pista: track.pista,
                total_voltas: track.total_voltas,
                tempo_total: Number(track.tempo_total || 0),
                media: Number(track.media || 0)
            }))
        });
    } catch (error) {
        console.error('Erro resumo de pistas:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// RANKING DE PILOTOS POR PISTA
router.get('/ranking/pistas', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                v.pista,
                c.id_corredores AS id_corredor,
                c.nome,
                c.turma,
                c.equipe,
                COUNT(v.id) AS total_voltas,
                COALESCE(SUM(v.tempo), 0) AS tempo_total,
                COALESCE(AVG(v.tempo), 0) AS media,
                MIN(v.tempo) AS melhor_volta
            FROM voltas v
            JOIN corredores c ON v.corredor_id = c.id_corredores
            GROUP BY v.pista, c.id_corredores, c.nome, c.turma, c.equipe
            ORDER BY v.pista ASC, tempo_total ASC, total_voltas DESC
        `);

        const ranking = rows.reduce((acc, row) => {
            const pista = String(row.pista);
            if (!acc[pista]) acc[pista] = [];
            acc[pista].push({
                id_corredor: row.id_corredor,
                nome: row.nome,
                turma: row.turma,
                equipe: row.equipe,
                total_voltas: row.total_voltas,
                tempo_total: Number(row.tempo_total || 0),
                media: Number(row.media || 0),
                melhor_volta: row.melhor_volta
            });
            return acc;
        }, {});

        res.json({ ranking });
    } catch (error) {
        console.error('Erro ranking por pista:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

module.exports = router;