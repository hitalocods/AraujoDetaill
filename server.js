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

// ==========================================
// INTEGRAÇÃO GATEWAY ABACATEPAY (PIX)
// ==========================================

async function createAbacatePayBilling({ apiKey, booking, amount, chargeType, host }) {
    if (!apiKey) throw new Error('Chave de API do AbacatePay não configurada.');

    const cleanPhone = (booking.client_phone || '').replace(/\D/g, '');
    const priceInCents = Math.max(100, Math.round(amount * 100)); // em centavos (mínimo R$ 1,00)

    const payload = {
        frequency: "ONE_TIME",
        methods: ["PIX"],
        products: [
            {
                externalId: `booking-${booking.id}`,
                name: `${chargeType === 'full' ? 'Pagamento Total' : 'Sinal (50%)'} - Araújo Detail`,
                description: `${booking.services_names || 'Serviço'} - ${booking.vehicle_name || 'Veículo'} (${booking.booking_date} às ${booking.booking_time})`,
                quantity: 1,
                price: priceInCents
            }
        ],
        returnUrl: `${host}/?bookingId=${booking.id}`,
        completionUrl: `${host}/?bookingId=${booking.id}&paid=true`,
        customer: {
            name: booking.client_name,
            cellphone: cleanPhone.length >= 10 ? cleanPhone : '86999999999',
            email: `${(booking.client_name || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '') || 'cliente'}@araujodetail.com.br`
        },
        metadata: {
            booking_id: String(booking.id),
            client_name: booking.client_name,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time
        }
    };

    const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || (data.error && !data.data)) {
        throw new Error(data.error || data.message || 'Erro ao comunicar com a API do AbacatePay');
    }

    const billing = data.data || data;
    return {
        payment_id: billing.id || billing._id || `abp_${Date.now()}`,
        pix_url: billing.url || '',
        pix_copia_cola: billing.pix?.code || billing.pixCode || billing.brCode || billing.url || '',
        pix_qrcode: billing.pix?.qrCodeUrl || billing.qrCode || '',
        raw: billing
    };
}

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

        // Verifica se o AbacatePay está ativo para gerar cobrança PIX automática
        let abacatepayData = null;
        try {
            const config = await db.getConfig();
            if (config.abacatepay_enabled && config.abacatepay_api_key) {
                const chargeAmount = config.abacatepay_charge_type === 'full' ? (newBooking.total_price || newBooking.deposit_price) : (newBooking.deposit_price || newBooking.total_price / 2);
                const host = `${req.protocol}://${req.get('host')}`;
                
                const abpRes = await createAbacatePayBilling({
                    apiKey: config.abacatepay_api_key,
                    booking: newBooking,
                    amount: chargeAmount,
                    chargeType: config.abacatepay_charge_type || 'deposit',
                    host
                });

                if (abpRes) {
                    abacatepayData = abpRes;
                    await db.updateBookingPayment(newBooking.id, {
                        payment_id: abpRes.payment_id,
                        payment_status: 'pendente',
                        pix_qrcode: abpRes.pix_qrcode,
                        pix_copia_cola: abpRes.pix_copia_cola,
                        pix_url: abpRes.pix_url
                    });
                    newBooking.payment_id = abpRes.payment_id;
                    newBooking.pix_copia_cola = abpRes.pix_copia_cola;
                    newBooking.pix_qrcode = abpRes.pix_qrcode;
                    newBooking.pix_url = abpRes.pix_url;
                }
            }
        } catch (gatewayErr) {
            console.warn('Aviso: Não foi possível gerar PIX no AbacatePay (mantendo fluxo normal):', gatewayErr.message);
        }

        res.json({ 
            success: true, 
            booking: newBooking,
            abacatepay: abacatepayData
        });
    } catch (err) {
        console.error('Erro ao salvar agendamento:', err);
        res.status(500).json({ success: false, error: 'Erro ao registrar agendamento' });
    }
});

// Endpoint para consultar status do pagamento em tempo real
app.get('/api/public/bookings/:id/payment-status', async (req, res) => {
    try {
        const booking = await db.getBookingById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
        }
        res.json({
            success: true,
            id: booking.id,
            status: booking.status,
            payment_status: booking.payment_status || 'pendente',
            isPaid: booking.payment_status === 'pago' || booking.status === 'confirmado' || booking.status === 'concluido'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Webhook para receber confirmação de pagamento do AbacatePay
app.post('/api/webhooks/abacatepay', async (req, res) => {
    try {
        const payload = req.body;
        console.log('[Webhook AbacatePay Recebido]:', JSON.stringify(payload));

        const event = payload.event || payload.type || '';
        const data = payload.data || payload;

        const isPaid = event.includes('paid') || event.includes('PAID') || event.includes('confirmed') || data.status === 'PAID' || data.status === 'CONFIRMED' || data.status === 'COMPLETED';

        let bookingId = null;
        if (data.metadata && data.metadata.booking_id) {
            bookingId = parseInt(data.metadata.booking_id);
        } else if (data.products && data.products[0] && data.products[0].externalId) {
            bookingId = parseInt(data.products[0].externalId.replace('booking-', ''));
        }

        const billingId = data.id || data.billingId || data._id;

        if (isPaid) {
            let booking = null;
            if (bookingId) {
                booking = await db.getBookingById(bookingId);
            }
            if (!booking && billingId) {
                booking = await db.getBookingByPaymentId(billingId);
            }

            if (booking) {
                await db.updateBookingPayment(booking.id, {
                    payment_status: 'pago',
                    status: 'confirmado'
                });
                console.log(`✅ [Webhook AbacatePay] Agendamento #${booking.id} (${booking.client_name}) foi PAGO e CONFIRMADO com sucesso!`);
            }
        }

        return res.json({ success: true, message: 'Webhook processado com sucesso' });
    } catch (err) {
        console.error('Erro ao processar Webhook AbacatePay:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Teste de conexão com AbacatePay
app.post('/api/admin/abacatepay/test-connection', requireAdminAuth, async (req, res) => {
    try {
        const { api_key } = req.body;
        const config = await db.getConfig();
        const keyToTest = (api_key || config.abacatepay_api_key || '').trim();

        if (!keyToTest) {
            return res.status(400).json({ success: false, error: 'Chave de API do AbacatePay não informada.' });
        }

        const response = await fetch('https://api.abacatepay.com/v1/billing/list', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${keyToTest}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (response.ok && (data.data !== undefined || data.success !== false)) {
            return res.json({ success: true, message: 'Conexão com AbacatePay validada com sucesso! API Key ativa.' });
        } else {
            return res.status(400).json({ success: false, error: data.error || data.message || 'Chave de API inválida ou não autorizada pelo AbacatePay.' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Erro ao testar conexão com AbacatePay: ' + err.message });
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
