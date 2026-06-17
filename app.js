const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    headers: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const userRoutes = require('./routes/user');

const corredorRoutes = require('./routes/corredor');

const voltasRoutes = require('./routes/voltas');

app.use('/usuarios', userRoutes);
app.use('/corredores', corredorRoutes);
app.use('/voltas', voltasRoutes);

// Rota de teste
app.get('/test', (req, res) => {
    res.json({ status: 'Servidor rodando com sucesso!' });
});

module.exports = app;
