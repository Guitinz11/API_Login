const express = require('express');
const userRoutes = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// LISTAR TODOS OS USUÁRIOS
userRoutes.get('/', async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM users');
        res.json(users);
    } catch (error) {
        console.error('Erro ao buscar usuários: ', error.message);
        res.status(500).json({ erro: error.message });
    }   
});

// CRIAR USUÁRIO
userRoutes.post('/cadastro', async (req, res) => {
    const { nome, email, senha, turma } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10); 
    if (!nome || !email || !senha || !turma) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO users (nome, email, senha, turma) VALUES (?, ?, ?, ?)',
            [nome, email, senhaHash, turma]
        );
        res.status(201).json({ id: result.insertId, nome, email, turma });
    } catch (error) {
        console.error('Erro ao criar usuário: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

// ATUALIZAR USUÁRIO
userRoutes.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, senha, turma } = req.body;
    
    if (!nome || !email || !turma) {
        return res.status(400).json({ erro: 'Nome, email e turma são obrigatórios' });
    }

    try {
        let senhaHash = null;
        if (senha) {
            senhaHash = await bcrypt.hash(senha, 10);
        }

        if (senhaHash) {
            const [result] = await db.query(
                'UPDATE users SET nome = ?, email = ?, senha = ?, turma = ? WHERE id_users = ?',
                [nome, email, senhaHash, turma, id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ erro: 'Usuário não encontrado' });
            }
        } else {
            const [result] = await db.query(
                'UPDATE users SET nome = ?, email = ?, turma = ? WHERE id_users = ?',
                [nome, email, turma, id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ erro: 'Usuário não encontrado' });
            }
        }
        res.json({ mensagem: 'Usuário atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar usuário: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

// DELETAR USUÁRIO
userRoutes.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM users WHERE id_users = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }
        res.json({ mensagem: 'Usuário excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir usuário: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});


//LOGIN DO USARIO
const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui';

// LOGIN DO USUÁRIO
userRoutes.post('/login', async (req, res) => {  // ✅ Sem espaço extra
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const user = rows[0];
        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const token = jwt.sign(
            {
                id: user.id_users,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.status(200).json({
            message: 'Login realizado com sucesso',
            token,
            user: {
                id: user.id_users,
                nome: user.nome,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Erro ao fazer login: ', error.message);
        res.status(500).json({ erro: error.message });
    }
});

module.exports = userRoutes;