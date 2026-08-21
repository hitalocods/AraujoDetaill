require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, initPostgresTables } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'araujo123';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos
app.use(express.static(__dirname));

// Rota raiz e rota admin
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// AUTENTICAÇÃO DO ADMIN
// ==========================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        // Token simples e seguro baseado em hash ou timestamp
        const token = Buffer.from(`araujo_detail_admin_session_${ADMIN_PASSWORD}`).toString('base64');
        return res.json({ success: true, token });
    }
    return res.status(401).json({ success: false, error: 'Senha incorreta' });
});

// Middleware de Proteção para rotas /api/admin/*
const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
    const expectedToken = Buffer.from(`araujo_detail_admin_session_${ADMIN_PASSWORD}`).toString('base64');

    if (authHeader && (authHeader === expectedToken || authHeader === `Bearer ${expectedToken}` || authHeader === ADMIN_PASSWORD)) {
        return next();
    }
    return res.status(401).json({ success: false, error: 'Não autorizado. Faça login com a senha de admin.' });
};

// ==========================================
// API PÚBLICA (Usada pelo cliente em index.html)
// ==========================================

app.get('/api/public/config', async (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    try {
        const config = await db.getConfig();
        const services = (await db.getServices()).filter(s => s.active);
        const vehicles = (await db.getVehicles()).filter(v => v.active);
        const blocked = await db.getBlockedSchedules();

        res.json({
            success: true,
            config,
            services,
            vehicles,
            blocked
        });
    } catch (err) {
        console.error('Erro ao buscar public config:', err);
        res.status(500).json({ success: false, error: 'Erro ao carregar dados do agendamento' });
    }
});

app.get('/api/public/available-slots', async (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, error: 'Data não informada' });

        const dateObj = new Date(date + 'T00:00:00');
        const dow = dateObj.getDay(); // 0=Domingo, 1=Segunda, etc.

        const DEFAULT_TIMES = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
        const blocked = await db.getBlockedSchedules();
        const bookings = (await db.getBookings()).filter(b => b.booking_date === date && b.status !== 'cancelado');

        // Verifica se há bloqueio de dia da semana recorrente (ex: Toda segunda)
        const isDowBlocked = blocked.some(b => b.block_type === 'dow' && b.block_dow === dow);
        // Verifica se o dia específico está bloqueado por inteiro
        const isDateBlocked = blocked.some(b => (b.block_type === 'date' || !b.block_type) && b.block_date === date && !b.block_time);

        if (isDowBlocked || isDateBlocked) {
            return res.json({ success: true, isFullDayBlocked: true, slots: [] });
        }

        const blockedTimes = blocked.filter(b => b.block_date === date && b.block_time).map(b => b.block_time);
        const bookedTimes = bookings.map(b => b.booking_time);

        const slots = DEFAULT_TIMES.map(time => ({
            time,
            available: !blockedTimes.includes(time) && !bookedTimes.includes(time),
            reason: blockedTimes.includes(time) ? 'Horário bloqueado' : (bookedTimes.includes(time) ? 'Já agendado' : 'Livre')
        }));

        res.json({ success: true, isFullDayBlocked: false, slots });
    } catch (err) {
        console.error('Erro ao buscar slots disponíveis:', err);
        res.status(500).json({ success: false, error: 'Erro ao verificar horários' });
    }
});

app.post('/api/public/bookings', async (req, res) => {
    try {
        const { client_name, client_phone, client_notes, vehicle_id, vehicle_name, services_ids, services_names, booking_date, booking_time, total_price, deposit_price } = req.body;

        if (!client_name || !client_phone || !booking_date || !booking_time) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
        }

        // Validação anti-colisão de agendamento em tempo real
        const existingBookings = await db.getBookings();
        const isAlreadyBooked = existingBookings.some(b => b.booking_date === booking_date && b.booking_time === booking_time && b.status !== 'cancelado');
        if (isAlreadyBooked) {
            return res.status(409).json({ success: false, error: 'Este horário acabou de ser agendado por outro cliente. Por favor, escolha outro horário.' });
        }

        const newBooking = await db.createBooking({
            client_name,
            client_phone,
            client_notes,
            vehicle_id,
            vehicle_name,
            services_ids: services_ids || [],
            services_names: services_names || '',
            booking_date,
            booking_time,
            total_price: total_price || 0,
            deposit_price: deposit_price || 0
        });

        res.json({ success: true, booking: newBooking });
    } catch (err) {
        console.error('Erro ao salvar agendamento:', err);
        res.status(500).json({ success: false, error: 'Erro ao registrar agendamento' });
    }
});

// ==========================================
// API ADMINISTRATIVA (Protegida por Senha)
// ==========================================

// Config
app.get('/api/admin/config', requireAdminAuth, async (req, res) => {
    try {
        const config = await db.getConfig();
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/config', requireAdminAuth, async (req, res) => {
    try {
        const updated = await db.updateConfig(req.body);
        res.json({ success: true, config: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Serviços (CRUD)
app.get('/api/admin/services', requireAdminAuth, async (req, res) => {
    try {
        const services = await db.getServices();
        res.json({ success: true, services });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/services', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createService(req.body);
        res.json({ success: true, service: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/services/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.updateService(req.params.id, req.body);
        res.json({ success: true, service: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/services/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteService(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Veículos (CRUD)
app.get('/api/admin/vehicles', requireAdminAuth, async (req, res) => {
    try {
        const vehicles = await db.getVehicles();
        res.json({ success: true, vehicles });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/vehicles', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createVehicle(req.body);
        res.json({ success: true, vehicle: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/vehicles/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.updateVehicle(req.params.id, req.body);
        res.json({ success: true, vehicle: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/vehicles/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteVehicle(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Bloqueios de Agenda
app.get('/api/admin/schedules', requireAdminAuth, async (req, res) => {
    try {
        const blocked = await db.getBlockedSchedules();
        res.json({ success: true, blocked });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/schedules', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.blockSchedule(req.body);
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/schedules/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.unblockSchedule(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Agendamentos (Admin)
app.get('/api/admin/bookings', requireAdminAuth, async (req, res) => {
    try {
        const bookings = await db.getBookings();
        res.json({ success: true, bookings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/bookings', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createBooking(req.body);
        res.json({ success: true, booking: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/bookings/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.updateBooking(req.params.id, req.body);
        res.json({ success: true, booking: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/bookings/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteBooking(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Funcionários
app.get('/api/admin/employees', requireAdminAuth, async (req, res) => {
    try {
        const employees = await db.getEmployees();
        res.json({ success: true, employees });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/employees', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createEmployee(req.body);
        res.json({ success: true, employee: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/employees/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.updateEmployee(req.params.id, req.body);
        res.json({ success: true, employee: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/employees/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteEmployee(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Estoque
app.get('/api/admin/inventory', requireAdminAuth, async (req, res) => {
    try {
        const inventory = await db.getInventory();
        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/inventory', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createInventoryItem(req.body);
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/inventory/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.updateInventoryItem(req.params.id, req.body);
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/inventory/:id/stock', requireAdminAuth, async (req, res) => {
    try {
        const { addedQuantity, logExpense } = req.body;
        const item = await db.adjustInventoryStock(req.params.id, addedQuantity, logExpense);
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/inventory/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteInventoryItem(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Despesas
app.get('/api/admin/expenses', requireAdminAuth, async (req, res) => {
    try {
        const expenses = await db.getExpenses();
        res.json({ success: true, expenses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/expenses', requireAdminAuth, async (req, res) => {
    try {
        const item = await db.createExpense(req.body);
        res.json({ success: true, expense: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/expenses/:id', requireAdminAuth, async (req, res) => {
    try {
        await db.deleteExpense(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Relatório Financeiro (Dia, Semana, Mês ou Intervalo Customizado de/até)
app.get('/api/admin/financial', requireAdminAuth, async (req, res) => {
    try {
        const period = req.query.period || 'month';
        const refDate = req.query.refDate || new Date().toISOString().slice(0, 10);
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;
        const report = await db.getFinancialReport(period, refDate, startDate, endDate);
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Inicia servidor e banco de dados
app.listen(PORT, async () => {
    console.log(`🚀 Servidor Araújo Detail rodando na porta ${PORT}`);
    console.log(`🌐 Cliente: http://localhost:${PORT}`);
    console.log(`⚙️  Admin:   http://localhost:${PORT}/admin`);
    await initPostgresTables();
});
