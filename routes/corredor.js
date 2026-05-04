const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// LISTAR TODOS OS CORREDORES
router.get('/', async (req, res) => {
    try {
        const [corredores] = await db.query('SELECT * FROM corredores');
        res.json(corredores);
    } catch (error) {
        console.error('Erro ao buscar corredores: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

// CRIAR CORREDOR
router.post('/cadastro', async (req, res) => {
    
    const { nome, email, senha, turma, equipe } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10); 
    if (!nome || !email || !senha || !turma || !equipe) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO corredores (nome, email, senha, turma, equipe) VALUES (?, ?, ?, ?, ?)',
            [nome, email, senhaHash, turma, equipe]
        );

        res.status(201).json({ id: result.insertId, nome, email, turma, equipe });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});


// ATUALIZAR CORREDOR
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, senha, turma, equipe } = req.body;
    
    if (!nome || !email || !turma || !equipe) {
        return res.status(400).json({ erro: 'Nome, email, turma e equipe são obrigatórios' });
    }

    try {
        let senhaHash = null;
        if (senha) {
            senhaHash = await bcrypt.hash(senha, 10);
        }

        if (senhaHash) {
            const [result] = await db.query(
                'UPDATE corredores SET nome = ?, email = ?, senha = ?, turma = ?, equipe = ? WHERE id_corredores = ?',
                [nome, email, senhaHash, turma, equipe, id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ erro: 'Corredor não encontrado' });
            }
        } else {
            const [result] = await db.query(
                'UPDATE corredores SET nome = ?, email = ?, turma = ?, equipe = ? WHERE id_corredores = ?',
                [nome, email, turma, equipe, id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ erro: 'Corredor não encontrado' });
            }
        }
        res.json({ mensagem: 'Corredor atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// DELETAR CORREDOR
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM corredores WHERE id_corredores = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ erro: 'Corredor não encontrado' });
        }
        res.json({ mensagem: 'Corredor deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar corredor: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui'; 

// LOGIN DO CORREDOR
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    try {
        const [corredores] = await db.query('SELECT * FROM corredores WHERE email = ?', [email]);

        if (corredores.length === 0) {
            return res.status(404).json({ erro: 'Corredor não encontrado' });
        }

        const corredor = corredores[0];
        const senhaValida = await bcrypt.compare(senha, corredor.senha);

        if (!senhaValida) {
            return res.status(401).json({ erro: 'Senha incorreta' });
        }

        const token = jwt.sign(
            {
                id: corredor.id_corredores, 
                email: corredor.email
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        return res.status(200).json({
            message: 'Login realizado com sucesso',
            token,
            corredor: {
                id: corredor.id_corredores,
                nome: corredor.nome,
                email: corredor.email
            }
        });

    } catch (error) {
        console.error('Erro ao realizar login: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

module.exports = router;        