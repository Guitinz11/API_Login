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
            melhor_volta: row.melhor_volta !== null ? Number(row.melhor_volta) : null
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
                melhor_volta: row.melhor_volta !== null ? Number(row.melhor_volta) : null
            });
            return acc;
        }, {});

        res.json({ ranking });
    } catch (error) {
        console.error('Erro ranking por pista:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

// ANALYTICS ADMINISTRATIVO
router.get('/analytics/admin', async (req, res) => {
    try {
        const [laps] = await db.query(`
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
            ORDER BY v.data ASC, v.id ASC
        `);

        const numericLaps = (laps || []).map(lap => ({
            ...lap,
            tempo: Number(lap.tempo || 0),
            pista: Number(lap.pista || 1)
        })).filter(lap => lap.tempo > 0);

        if (numericLaps.length === 0) {
            return res.json({
                overview: {
                    total_voltas: 0,
                    total_pilotos: 0,
                    total_equipes: 0,
                    melhor_tempo: null,
                    pior_tempo: null,
                    media_geral: 0,
                    amplitude: 0
                },
                byTrack: [],
                byTeam: [],
                drivers: [],
                recentTrend: [],
                insights: []
            });
        }

        const uniqueDrivers = new Set(numericLaps.map(lap => lap.id_corredor));
        const uniqueTeams = new Set(numericLaps.map(lap => lap.equipe || 'Sem equipe'));
        const bestLap = numericLaps.reduce((best, lap) => lap.tempo < best.tempo ? lap : best, numericLaps[0]);
        const worstLap = numericLaps.reduce((worst, lap) => lap.tempo > worst.tempo ? lap : worst, numericLaps[0]);
        const totalTime = numericLaps.reduce((sum, lap) => sum + lap.tempo, 0);
        const overallAverage = totalTime / numericLaps.length;

        function summarizeGroup(rows) {
            const times = rows.map(row => row.tempo);
            const best = Math.min(...times);
            const worst = Math.max(...times);
            const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
            const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
            return {
                total_voltas: rows.length,
                melhor_tempo: Number(best.toFixed(2)),
                pior_tempo: Number(worst.toFixed(2)),
                media: Number(avg.toFixed(2)),
                amplitude: Number((worst - best).toFixed(2)),
                consistencia: Number(Math.sqrt(variance).toFixed(2))
            };
        }

        function groupBy(rows, keyFn) {
            return rows.reduce((acc, row) => {
                const key = keyFn(row);
                if (!acc[key]) acc[key] = [];
                acc[key].push(row);
                return acc;
            }, {});
        }

        const byTrack = Object.entries(groupBy(numericLaps, lap => lap.pista))
            .map(([pista, rows]) => ({
                pista: Number(pista),
                ...summarizeGroup(rows),
                diferenca_para_melhor_geral: Number((Math.min(...rows.map(row => row.tempo)) - bestLap.tempo).toFixed(2))
            }))
            .sort((a, b) => a.pista - b.pista);

        const byTeam = Object.entries(groupBy(numericLaps, lap => lap.equipe || 'Sem equipe'))
            .map(([equipe, rows]) => ({
                equipe,
                pilotos: new Set(rows.map(row => row.id_corredor)).size,
                ...summarizeGroup(rows),
                diferenca_para_melhor_geral: Number((Math.min(...rows.map(row => row.tempo)) - bestLap.tempo).toFixed(2))
            }))
            .sort((a, b) => a.media - b.media);

        const drivers = Object.entries(groupBy(numericLaps, lap => lap.id_corredor))
            .map(([, rows]) => {
                const ordered = [...rows].sort((a, b) => new Date(a.data) - new Date(b.data) || a.id - b.id);
                const first = ordered[0];
                const last = ordered[ordered.length - 1];
                const summary = summarizeGroup(rows);
                return {
                    id_corredor: first.id_corredor,
                    nome: first.nome,
                    turma: first.turma,
                    equipe: first.equipe,
                    ...summary,
                    diferenca_para_melhor_geral: Number((summary.melhor_tempo - bestLap.tempo).toFixed(2)),
                    evolucao: Number((first.tempo - last.tempo).toFixed(2)),
                    tendencia: first.tempo > last.tempo ? 'melhorando' : first.tempo < last.tempo ? 'piorando' : 'estavel'
                };
            })
            .sort((a, b) => a.melhor_tempo - b.melhor_tempo);

        const recentTrend = numericLaps.slice(-20).map((lap, index) => ({
            ordem: index + 1,
            id: lap.id,
            tempo: lap.tempo,
            pista: lap.pista,
            corredor: lap.nome,
            equipe: lap.equipe,
            data: lap.data
        }));

        const mostConsistent = [...drivers].filter(driver => driver.total_voltas > 1).sort((a, b) => a.consistencia - b.consistencia)[0];
        const biggestImprovement = [...drivers].filter(driver => driver.total_voltas > 1).sort((a, b) => b.evolucao - a.evolucao)[0];
        const slowestTrack = [...byTrack].sort((a, b) => b.media - a.media)[0];
        const fastestTeam = byTeam[0];

        const insights = [
            {
                titulo: 'Melhor volta registrada',
                valor: `${bestLap.tempo.toFixed(2)}s`,
                detalhe: `${bestLap.nome} - Pista ${bestLap.pista}. Referencia para comparar diferenca de tempo.`
            },
            {
                titulo: 'Maior diferenca entre voltas',
                valor: `${(worstLap.tempo - bestLap.tempo).toFixed(2)}s`,
                detalhe: `Entre ${bestLap.nome} (${bestLap.tempo.toFixed(2)}s) e ${worstLap.nome} (${worstLap.tempo.toFixed(2)}s).`
            },
            {
                titulo: 'Pista mais lenta pela media',
                valor: slowestTrack ? `Pista ${slowestTrack.pista}` : '--',
                detalhe: slowestTrack ? `Media de ${slowestTrack.media.toFixed(2)}s. Pode indicar curva dificil, atrito ou perda de tracao.` : 'Sem dados.'
            },
            {
                titulo: 'Equipe mais rapida',
                valor: fastestTeam ? fastestTeam.equipe : '--',
                detalhe: fastestTeam ? `Media de ${fastestTeam.media.toFixed(2)}s em ${fastestTeam.total_voltas} voltas.` : 'Sem dados.'
            },
            {
                titulo: 'Mais consistente',
                valor: mostConsistent ? mostConsistent.nome : '--',
                detalhe: mostConsistent ? `Variacao media de ${mostConsistent.consistencia.toFixed(2)}s. Bom sinal de carrinho equilibrado.` : 'Cadastre mais voltas por piloto.'
            },
            {
                titulo: 'Maior melhora',
                valor: biggestImprovement ? biggestImprovement.nome : '--',
                detalhe: biggestImprovement ? `Evoluiu ${biggestImprovement.evolucao.toFixed(2)}s da primeira para a ultima volta.` : 'Cadastre mais voltas por piloto.'
            }
        ];

        res.json({
            overview: {
                total_voltas: numericLaps.length,
                total_pilotos: uniqueDrivers.size,
                total_equipes: uniqueTeams.size,
                melhor_tempo: Number(bestLap.tempo.toFixed(2)),
                pior_tempo: Number(worstLap.tempo.toFixed(2)),
                media_geral: Number(overallAverage.toFixed(2)),
                amplitude: Number((worstLap.tempo - bestLap.tempo).toFixed(2))
            },
            byTrack,
            byTeam,
            drivers,
            recentTrend,
            insights
        });
    } catch (error) {
        console.error('Erro analytics admin:', error.message);
        res.status(500).json({ erro: 'Erro interno', detalhe: error.message });
    }
});

module.exports = router;
