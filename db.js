require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let useLocalDb = false;

// Conecta ao Neon PostgreSQL
if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    let cleanUrl = process.env.DATABASE_URL.replace(/channel_binding=[^&]+&?/g, '').replace(/\?&/, '?').replace(/\?$/, '');
    pool = new Pool({
        connectionString: cleanUrl,
        ssl: { rejectUnauthorized: false }
    });
    console.log('🔌 Conectando ao banco Neon PostgreSQL...');
} else {
    useLocalDb = true;
    console.log('⚠️ DATABASE_URL não configurada no .env. Utilizando armazenamento local inteligente (local_data.json).');
}

const LOCAL_DB_FILE = path.join(__dirname, 'local_data.json');

const DEFAULT_DATA = {
    business_config: {
        id: 1,
        pix_key: "86999999999",
        pix_bank: "Banco Inter / Nubank",
        pix_name: "Araújo Detail",
        whatsapp_number: "5599984937614",
        atlas_license_key: "ATLAS-CORE-DETAIL-2026",
        atlas_license_status: "Ativa",
        atlas_license_owner: "Araújo Detail - Carlos Araújo",
        abacatepay_api_key: "",
        abacatepay_enabled: false,
        abacatepay_mode: "production",
        abacatepay_charge_type: "deposit"
    },
    services: [
        { id: 1, name: "Lavagem Detalhada", description: "Higienização interna e externa minuciosa", category: "Lavagem", icon: "spray", prices: { moto: 35, passeio: 50, suv: 60, pickup: 70 }, active: true },
        { id: 2, name: "Lavagem de Motor", description: "Limpeza técnica com verniz protetor", category: "Motor", icon: "wrench", prices: { moto: 30, passeio: 40, suv: 50, pickup: 60 }, active: true },
        { id: 3, name: "Higienização Completa", description: "Bancos, teto, carpetes e revitalização", category: "Interior", icon: "sparkle", prices: { moto: 100, passeio: 180, suv: 220, pickup: 260 }, active: true },
        { id: 4, name: "Polimento Técnico", description: "Correção de pintura e brilho espelhado", category: "Polimento", icon: "polish", prices: { moto: 200, passeio: 350, suv: 450, pickup: 550 }, active: true },
        { id: 5, name: "Vitrificação", description: "Proteção cerâmica duradoura", category: "Proteção", icon: "shield", prices: { moto: 400, passeio: 700, suv: 900, pickup: 1100 }, active: true },
        { id: 6, name: "Descontaminação Ferrosa", description: "Remoção de chuva ácida, piche e cola", category: "Pintura", icon: "magnet", prices: { moto: 50, passeio: 80, suv: 100, pickup: 120 }, active: true }
    ],
    vehicles: [
        { id: "moto", name: "Moto", description: "Motocicletas e scooters", price: 35.00, icon: "bike", active: true },
        { id: "passeio", name: "Passeio", description: "Hatchs e sedans", price: 50.00, icon: "car", active: true },
        { id: "suv", name: "SUV", description: "SUVs e crossovers", price: 60.00, icon: "suv", active: true },
        { id: "pickup", name: "Pickup", description: "Pickups e caminhonetes", price: 70.00, icon: "truck", active: true }
    ],
    schedules_blocked: [],
    employees: [
        { id: 1, name: "Carlos Araújo", role: "Detailer Master", phone: "(86) 99999-1111", commission_type: "percentage", commission_value: 30, active: true },
        { id: 2, name: "Marcos Lima", role: "Assistente de Lavagem", phone: "(86) 99999-2222", commission_type: "fixed", commission_value: 15, active: true }
    ],
    bookings: [],
    inventory: [
        { id: 1, name: "Shampoo Neutro V-Floc 1.5L", category: "Shampoos", quantity: 4, min_quantity: 2, unit: "un", unit_cost: 45.00 },
        { id: 2, name: "Cera Carnaúba Blend Paste", category: "Ceras", quantity: 2, min_quantity: 1, unit: "un", unit_cost: 85.00 },
        { id: 3, name: "Composto Polidor Corte V10 500ml", category: "Polimento", quantity: 1, min_quantity: 2, unit: "un", unit_cost: 65.00 },
        { id: 4, name: "Toalhas de Microfibra 40x40", category: "Acessórios", quantity: 18, min_quantity: 10, unit: "un", unit_cost: 7.50 }
    ],
    expenses: []
};

function getLocalData() {
    if (!fs.existsSync(LOCAL_DB_FILE)) {
        fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
        return DEFAULT_DATA;
    }
    try {
        const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        return DEFAULT_DATA;
    }
}

function saveLocalData(data) {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Inicializa tabelas no PostgreSQL (Neon)
async function initPostgresTables() {
    if (!pool) return;
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS business_config (
                    id SERIAL PRIMARY KEY,
                    pix_key VARCHAR(255) DEFAULT '86999999999',
                    pix_bank VARCHAR(255) DEFAULT 'Banco Inter / Nubank',
                    pix_name VARCHAR(255) DEFAULT 'Araújo Detail',
                    whatsapp_number VARCHAR(50) DEFAULT '5599984937614',
                    atlas_license_key VARCHAR(255) DEFAULT 'ATLAS-CORE-DETAIL-2026',
                    atlas_license_status VARCHAR(100) DEFAULT 'Ativa',
                    atlas_license_owner VARCHAR(255) DEFAULT 'Araújo Detail - Carlos Araújo',
                    abacatepay_api_key TEXT DEFAULT '',
                    abacatepay_enabled BOOLEAN DEFAULT false,
                    abacatepay_mode VARCHAR(50) DEFAULT 'production',
                    abacatepay_charge_type VARCHAR(50) DEFAULT 'deposit',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS services (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    category VARCHAR(100) DEFAULT 'Geral',
                    icon VARCHAR(50) DEFAULT 'spray',
                    prices JSONB DEFAULT '{"passeio": 50, "suv": 60, "pickup": 70}'::jsonb,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS vehicles (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    price NUMERIC(10, 2) NOT NULL,
                    icon VARCHAR(50) DEFAULT 'car',
                    active BOOLEAN DEFAULT true
                );

                CREATE TABLE IF NOT EXISTS schedules_blocked (
                    id SERIAL PRIMARY KEY,
                    block_type VARCHAR(20) DEFAULT 'date',
                    block_date VARCHAR(20),
                    block_dow INTEGER,
                    block_time VARCHAR(20),
                    reason TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS employees (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    role VARCHAR(100) DEFAULT 'Detailer',
                    phone VARCHAR(50),
                    commission_type VARCHAR(20) DEFAULT 'percentage',
                    commission_value NUMERIC(10, 2) DEFAULT 0,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS bookings (
                    id SERIAL PRIMARY KEY,
                    client_name VARCHAR(255) NOT NULL,
                    client_phone VARCHAR(50) NOT NULL,
                    client_notes TEXT,
                    vehicle_id VARCHAR(50),
                    vehicle_name VARCHAR(100),
                    services_ids JSONB,
                    services_names TEXT,
                    booking_date VARCHAR(20) NOT NULL,
                    booking_time VARCHAR(20) NOT NULL,
                    total_price NUMERIC(10, 2) DEFAULT 0,
                    deposit_price NUMERIC(10, 2) DEFAULT 0,
                    status VARCHAR(50) DEFAULT 'pendente',
                    payment_id VARCHAR(255),
                    payment_status VARCHAR(50) DEFAULT 'pendente',
                    pix_qrcode TEXT,
                    pix_copia_cola TEXT,
                    pix_url TEXT,
                    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    commission_amount NUMERIC(10, 2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS inventory (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    category VARCHAR(100) DEFAULT 'Produtos',
                    quantity NUMERIC(10, 2) DEFAULT 0,
                    min_quantity NUMERIC(10, 2) DEFAULT 1,
                    unit VARCHAR(50) DEFAULT 'un',
                    unit_cost NUMERIC(10, 2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS expenses (
                    id SERIAL PRIMARY KEY,
                    description VARCHAR(255) NOT NULL,
                    category VARCHAR(100) DEFAULT 'Produto',
                    amount NUMERIC(10, 2) NOT NULL,
                    expense_date VARCHAR(20) NOT NULL,
                    inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Garante colunas de Licença Atlas e AbacatePay na tabela business_config
            await client.query(`
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS atlas_license_key VARCHAR(255) DEFAULT 'ATLAS-CORE-DETAIL-2026';
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS atlas_license_status VARCHAR(100) DEFAULT 'Ativa';
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS atlas_license_owner VARCHAR(255) DEFAULT 'Araújo Detail - Carlos Araújo';
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS abacatepay_api_key TEXT DEFAULT '';
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS abacatepay_enabled BOOLEAN DEFAULT false;
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS abacatepay_mode VARCHAR(50) DEFAULT 'production';
                ALTER TABLE business_config ADD COLUMN IF NOT EXISTS abacatepay_charge_type VARCHAR(50) DEFAULT 'deposit';
            `);

            // Garante colunas de pagamento dinâmico na tabela bookings
            await client.query(`
                ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
                ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pendente';
                ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pix_qrcode TEXT;
                ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT;
                ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pix_url TEXT;
            `);

            // Garante coluna prices em services
            await client.query(`
                ALTER TABLE services ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '{"passeio": 50, "suv": 60, "pickup": 70}'::jsonb;
            `);

            // Atualiza registros existentes que estejam sem prices no Neon
            for (const s of DEFAULT_DATA.services) {
                await client.query(`
                    UPDATE services 
                    SET prices = $1 
                    WHERE name ILIKE $2 AND (prices IS NULL OR prices = '{}'::jsonb)
                `, [JSON.stringify(s.prices), `%${s.name}%`]);
            }

            console.log('✅ Conectado ao Neon PostgreSQL com sucesso! Tabelas sincronizadas.');
            useLocalDb = false;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('⚠️ Erro ao conectar ao Postgres:', err.message);
        useLocalDb = true;
    }
}

function calculateCommission(emp, vehicleId, totalPrice) {
    if (!emp) return 0;
    if (emp.commission_type === 'by_vehicle' && emp.commission_rates && typeof emp.commission_rates === 'object') {
        const vKey = (vehicleId || '').toLowerCase();
        if (emp.commission_rates[vKey] !== undefined && emp.commission_rates[vKey] !== null && emp.commission_rates[vKey] !== '') {
            const parsed = parseFloat(emp.commission_rates[vKey]);
            if (!isNaN(parsed)) return parsed;
        }
    }
    if (emp.commission_type === 'percentage') {
        return (parseFloat(totalPrice || 0) * (parseFloat(emp.commission_value || 0) / 100));
    }
    return parseFloat(emp.commission_value || 0);
}

// Helpers de Banco de Dados
const db = {
    calculateCommission,

    // Config
    async getConfig() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM business_config LIMIT 1');
                if (res.rows.length > 0) return res.rows[0];
            } catch (e) { }
        }
        return getLocalData().business_config;
    },

    async updateConfig({
        pix_key, pix_bank, pix_name, whatsapp_number,
        atlas_license_key, atlas_license_status, atlas_license_owner,
        abacatepay_api_key, abacatepay_enabled, abacatepay_mode, abacatepay_charge_type
    }) {
        const current = await this.getConfig();
        const updated = {
            pix_key: pix_key !== undefined ? pix_key : (current.pix_key || '86999999999'),
            pix_bank: pix_bank !== undefined ? pix_bank : (current.pix_bank || 'Banco Inter / Nubank'),
            pix_name: pix_name !== undefined ? pix_name : (current.pix_name || 'Araújo Detail'),
            whatsapp_number: whatsapp_number !== undefined ? whatsapp_number : (current.whatsapp_number || '5599984937614'),
            atlas_license_key: atlas_license_key !== undefined ? atlas_license_key : (current.atlas_license_key || 'ATLAS-CORE-DETAIL-2026'),
            atlas_license_status: atlas_license_status !== undefined ? atlas_license_status : (current.atlas_license_status || 'Ativa'),
            atlas_license_owner: atlas_license_owner !== undefined ? atlas_license_owner : (current.atlas_license_owner || 'Araújo Detail - Carlos Araújo'),
            abacatepay_api_key: abacatepay_api_key !== undefined ? abacatepay_api_key : (current.abacatepay_api_key || ''),
            abacatepay_enabled: abacatepay_enabled !== undefined ? Boolean(abacatepay_enabled) : Boolean(current.abacatepay_enabled),
            abacatepay_mode: abacatepay_mode !== undefined ? abacatepay_mode : (current.abacatepay_mode || 'production'),
            abacatepay_charge_type: abacatepay_charge_type !== undefined ? abacatepay_charge_type : (current.abacatepay_charge_type || 'deposit')
        };

        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    `UPDATE business_config 
                     SET pix_key = $1, pix_bank = $2, pix_name = $3, whatsapp_number = $4,
                         atlas_license_key = $5, atlas_license_status = $6, atlas_license_owner = $7,
                         abacatepay_api_key = $8, abacatepay_enabled = $9, abacatepay_mode = $10, abacatepay_charge_type = $11,
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = 1 RETURNING *`,
                    [
                        updated.pix_key, updated.pix_bank, updated.pix_name, updated.whatsapp_number,
                        updated.atlas_license_key, updated.atlas_license_status, updated.atlas_license_owner,
                        updated.abacatepay_api_key, updated.abacatepay_enabled, updated.abacatepay_mode, updated.abacatepay_charge_type
                    ]
                );
                if (res.rows.length > 0) return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        data.business_config = { ...data.business_config, ...updated };
        saveLocalData(data);
        return data.business_config;
    },

    // Services
    async getServices() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM services ORDER BY id ASC');
                return res.rows.map(r => ({
                    ...r,
                    prices: typeof r.prices === 'string' ? JSON.parse(r.prices) : (r.prices || { passeio: 50, suv: 60, pickup: 70 })
                }));
            } catch (e) { }
        }
        return getLocalData().services;
    },

    async createService({ name, description, category, icon, prices = {}, active = true }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO services (name, description, category, icon, prices, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                    [name, description, category || 'Geral', icon || 'spray', JSON.stringify(prices), active]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.services.length > 0 ? Math.max(...data.services.map(s => s.id)) : 0) + 1;
        const newService = { id: newId, name, description, category: category || 'Geral', icon: icon || 'spray', prices, active };
        data.services.push(newService);
        saveLocalData(data);
        return newService;
    },

    async updateService(id, { name, description, category, icon, prices, active }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'UPDATE services SET name = $1, description = $2, category = $3, icon = $4, prices = $5, active = $6 WHERE id = $7 RETURNING *',
                    [name, description, category, icon, JSON.stringify(prices || {}), active, id]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const idx = data.services.findIndex(s => s.id === parseInt(id));
        if (idx !== -1) {
            data.services[idx] = { ...data.services[idx], name, description, category, icon, prices: prices || data.services[idx].prices, active };
            saveLocalData(data);
            return data.services[idx];
        }
        return null;
    },

    async deleteService(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM services WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.services = data.services.filter(s => s.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Vehicles
    async getVehicles() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM vehicles ORDER BY price ASC');
                return res.rows;
            } catch (e) { }
        }
        return getLocalData().vehicles;
    },

    async createVehicle({ id, name, description, price, icon = 'car', active = true }) {
        const cleanId = id || name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO vehicles (id, name, description, price, icon, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                    [cleanId, name, description, parseFloat(price), icon, active]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newVeh = { id: cleanId, name, description, price: parseFloat(price), icon, active };
        data.vehicles.push(newVeh);
        saveLocalData(data);
        return newVeh;
    },

    async updateVehicle(id, { name, description, price, icon, active }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'UPDATE vehicles SET name = $1, description = $2, price = $3, icon = $4, active = $5 WHERE id = $6 RETURNING *',
                    [name, description, parseFloat(price), icon, active, id]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const idx = data.vehicles.findIndex(v => v.id === id);
        if (idx !== -1) {
            data.vehicles[idx] = { ...data.vehicles[idx], name, description, price: parseFloat(price), icon, active };
            saveLocalData(data);
            return data.vehicles[idx];
        }
        return null;
    },

    async deleteVehicle(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.vehicles = data.vehicles.filter(v => v.id !== id);
        saveLocalData(data);
        return true;
    },

    // Bloqueios de Agenda (Datas, Horários e Dias da Semana Recorrentes)
    async getBlockedSchedules() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM schedules_blocked ORDER BY id DESC');
                return res.rows;
            } catch (e) { }
        }
        return getLocalData().schedules_blocked;
    },

    async blockSchedule({ block_type = 'date', block_date = null, block_dow = null, block_time = null, reason = 'Bloqueado pelo administrador' }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO schedules_blocked (block_type, block_date, block_dow, block_time, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                    [block_type, block_date, block_dow !== null && block_dow !== undefined && block_dow !== '' ? parseInt(block_dow) : null, block_time, reason]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.schedules_blocked.length > 0 ? Math.max(...data.schedules_blocked.map(b => b.id)) : 0) + 1;
        const newBlock = { id: newId, block_type, block_date, block_dow: block_dow !== null && block_dow !== undefined && block_dow !== '' ? parseInt(block_dow) : null, block_time, reason, created_at: new Date().toISOString() };
        data.schedules_blocked.push(newBlock);
        saveLocalData(data);
        return newBlock;
    },

    async unblockSchedule(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM schedules_blocked WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.schedules_blocked = data.schedules_blocked.filter(b => b.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Employees
    async getEmployees() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM employees ORDER BY name ASC');
                return res.rows;
            } catch (e) { }
        }
        return getLocalData().employees;
    },

    async createEmployee({ name, role = 'Detailer', phone = '', commission_type = 'by_vehicle', commission_value = 0, commission_rates = { moto: 10, passeio: 15, suv: 20, pickup: 25 }, active = true }) {
        const ratesJson = commission_rates || { moto: 10, passeio: 15, suv: 20, pickup: 25 };
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO employees (name, role, phone, commission_type, commission_value, commission_rates, active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                    [name, role, phone, commission_type, parseFloat(commission_value || 0), JSON.stringify(ratesJson), active]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.employees.length > 0 ? Math.max(...data.employees.map(emp => emp.id)) : 0) + 1;
        const newEmp = { id: newId, name, role, phone, commission_type, commission_value: parseFloat(commission_value || 0), commission_rates: ratesJson, active, created_at: new Date().toISOString() };
        data.employees.push(newEmp);
        saveLocalData(data);
        return newEmp;
    },

    async updateEmployee(id, { name, role, phone, commission_type = 'by_vehicle', commission_value = 0, commission_rates, active }) {
        const ratesJson = commission_rates || { moto: 10, passeio: 15, suv: 20, pickup: 25 };
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'UPDATE employees SET name = $1, role = $2, phone = $3, commission_type = $4, commission_value = $5, commission_rates = $6, active = $7 WHERE id = $8 RETURNING *',
                    [name, role, phone, commission_type, parseFloat(commission_value || 0), JSON.stringify(ratesJson), active, id]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const idx = data.employees.findIndex(emp => emp.id === parseInt(id));
        if (idx !== -1) {
            data.employees[idx] = { ...data.employees[idx], name, role, phone, commission_type, commission_value: parseFloat(commission_value || 0), commission_rates: ratesJson, active };
            saveLocalData(data);
            return data.employees[idx];
        }
        return null;
    },

    async deleteEmployee(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM employees WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.employees = data.employees.filter(emp => emp.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Bookings
    async getBookings() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(`
                    SELECT b.*, e.name as employee_name 
                    FROM bookings b 
                    LEFT JOIN employees e ON b.employee_id = e.id 
                    ORDER BY b.booking_date DESC, b.booking_time ASC
                `);
                return res.rows;
            } catch (e) { }
        }
        const data = getLocalData();
        return data.bookings.map(b => {
            const emp = data.employees.find(e => e.id === b.employee_id);
            return { ...b, employee_name: emp ? emp.name : null };
        }).sort((a, b) => (b.booking_date + b.booking_time).localeCompare(a.booking_date + a.booking_time));
    },

    async createBooking({ client_name, client_phone, client_notes = '', vehicle_id, vehicle_name, services_ids, services_names, booking_date, booking_time, total_price, deposit_price, status = 'pendente', employee_id = null }) {
        let commissionAmount = 0;
        if (employee_id) {
            const employees = await this.getEmployees();
            const emp = employees.find(e => e.id === parseInt(employee_id));
            if (emp) {
                commissionAmount = calculateCommission(emp, vehicle_id, total_price);
            }
        }

        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(`
                    INSERT INTO bookings (
                        client_name, client_phone, client_notes, vehicle_id, vehicle_name, 
                        services_ids, services_names, booking_date, booking_time, total_price, deposit_price, status, employee_id, commission_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *
                `, [
                    client_name, client_phone, client_notes, vehicle_id, vehicle_name,
                    JSON.stringify(services_ids), services_names, booking_date, booking_time,
                    parseFloat(total_price), parseFloat(deposit_price), status, employee_id ? parseInt(employee_id) : null, commissionAmount
                ]);
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.bookings.length > 0 ? Math.max(...data.bookings.map(b => b.id)) : 0) + 1;
        const newBooking = {
            id: newId,
            client_name,
            client_phone,
            client_notes,
            vehicle_id,
            vehicle_name,
            services_ids,
            services_names,
            booking_date,
            booking_time,
            total_price: parseFloat(total_price),
            deposit_price: parseFloat(deposit_price),
            status: status || 'pendente',
            employee_id: employee_id ? parseInt(employee_id) : null,
            commission_amount: commissionAmount,
            created_at: new Date().toISOString()
        };
        data.bookings.push(newBooking);
        saveLocalData(data);
        return newBooking;
    },

    async updateBooking(id, { client_name, client_phone, client_notes, vehicle_id, vehicle_name, services_ids, services_names, booking_date, booking_time, total_price, deposit_price, status, employee_id }) {
        let commissionAmount = 0;
        const employees = await this.getEmployees();
        const emp = employees.find(e => e.id === parseInt(employee_id));

        if (!useLocalDb && pool) {
            try {
                const bRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
                if (bRes.rows.length > 0) {
                    const current = bRes.rows[0];
                    const finalTotal = total_price !== undefined ? parseFloat(total_price) : parseFloat(current.total_price);
                    const finalVehId = vehicle_id || current.vehicle_id;
                    if (emp) {
                        commissionAmount = calculateCommission(emp, finalVehId, finalTotal);
                    }
                    const res = await pool.query(`
                        UPDATE bookings 
                        SET client_name = COALESCE($1, client_name),
                            client_phone = COALESCE($2, client_phone),
                            client_notes = COALESCE($3, client_notes),
                            vehicle_name = COALESCE($4, vehicle_name),
                            booking_date = COALESCE($5, booking_date),
                            booking_time = COALESCE($6, booking_time),
                            total_price = COALESCE($7, total_price),
                            status = COALESCE($8, status), 
                            employee_id = $9, 
                            commission_amount = $10 
                        WHERE id = $11 RETURNING *
                    `, [client_name, client_phone, client_notes, vehicle_name, booking_date, booking_time, total_price ? parseFloat(total_price) : null, status, employee_id ? parseInt(employee_id) : null, commissionAmount, id]);
                    return res.rows[0];
                }
            } catch (e) { }
        }

        const data = getLocalData();
        const idx = data.bookings.findIndex(b => b.id === parseInt(id));
        if (idx !== -1) {
            const current = data.bookings[idx];
            const finalTotal = total_price !== undefined ? parseFloat(total_price) : parseFloat(current.total_price);
            const finalVehId = vehicle_id || current.vehicle_id;
            if (emp) {
                commissionAmount = calculateCommission(emp, finalVehId, finalTotal);
            }
            data.bookings[idx] = {
                ...current,
                client_name: client_name !== undefined ? client_name : current.client_name,
                client_phone: client_phone !== undefined ? client_phone : current.client_phone,
                client_notes: client_notes !== undefined ? client_notes : current.client_notes,
                vehicle_name: vehicle_name !== undefined ? vehicle_name : current.vehicle_name,
                booking_date: booking_date !== undefined ? booking_date : current.booking_date,
                booking_time: booking_time !== undefined ? booking_time : current.booking_time,
                total_price: total_price !== undefined ? parseFloat(total_price) : current.total_price,
                status: status !== undefined ? status : current.status,
                employee_id: employee_id !== undefined ? (employee_id ? parseInt(employee_id) : null) : current.employee_id,
                commission_amount: commissionAmount
            };
            saveLocalData(data);
            return data.bookings[idx];
        }
        return null;
    },

    async getBookingById(id) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM bookings WHERE id = $1 LIMIT 1', [parseInt(id)]);
                if (res.rows.length > 0) return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        return data.bookings.find(b => b.id === parseInt(id)) || null;
    },

    async getBookingByPaymentId(paymentId) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM bookings WHERE payment_id = $1 LIMIT 1', [paymentId]);
                if (res.rows.length > 0) return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        return data.bookings.find(b => b.payment_id === paymentId) || null;
    },

    async updateBookingPayment(id, { payment_id, payment_status, pix_qrcode, pix_copia_cola, pix_url, status }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(`
                    UPDATE bookings 
                    SET payment_id = COALESCE($1, payment_id),
                        payment_status = COALESCE($2, payment_status),
                        pix_qrcode = COALESCE($3, pix_qrcode),
                        pix_copia_cola = COALESCE($4, pix_copia_cola),
                        pix_url = COALESCE($5, pix_url),
                        status = COALESCE($6, status)
                    WHERE id = $7 RETURNING *
                `, [payment_id, payment_status, pix_qrcode, pix_copia_cola, pix_url, status, parseInt(id)]);
                if (res.rows.length > 0) return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const idx = data.bookings.findIndex(b => b.id === parseInt(id));
        if (idx !== -1) {
            data.bookings[idx] = {
                ...data.bookings[idx],
                payment_id: payment_id !== undefined ? payment_id : data.bookings[idx].payment_id,
                payment_status: payment_status !== undefined ? payment_status : data.bookings[idx].payment_status,
                pix_qrcode: pix_qrcode !== undefined ? pix_qrcode : data.bookings[idx].pix_qrcode,
                pix_copia_cola: pix_copia_cola !== undefined ? pix_copia_cola : data.bookings[idx].pix_copia_cola,
                pix_url: pix_url !== undefined ? pix_url : data.bookings[idx].pix_url,
                status: status !== undefined ? status : data.bookings[idx].status
            };
            saveLocalData(data);
            return data.bookings[idx];
        }
        return null;
    },

    async deleteBooking(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.bookings = data.bookings.filter(b => b.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Inventory
    async getInventory() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM inventory ORDER BY name ASC');
                return res.rows;
            } catch (e) { }
        }
        return getLocalData().inventory;
    },

    async createInventoryItem({ name, category = 'Produtos', quantity = 0, min_quantity = 1, unit = 'un', unit_cost = 0 }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO inventory (name, category, quantity, min_quantity, unit, unit_cost) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                    [name, category, parseFloat(quantity), parseFloat(min_quantity), unit, parseFloat(unit_cost)]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.inventory.length > 0 ? Math.max(...data.inventory.map(i => i.id)) : 0) + 1;
        const newItem = { id: newId, name, category, quantity: parseFloat(quantity), min_quantity: parseFloat(min_quantity), unit, unit_cost: parseFloat(unit_cost), created_at: new Date().toISOString() };
        data.inventory.push(newItem);
        saveLocalData(data);
        return newItem;
    },

    async updateInventoryItem(id, { name, category, quantity, min_quantity, unit, unit_cost }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'UPDATE inventory SET name = $1, category = $2, quantity = $3, min_quantity = $4, unit = $5, unit_cost = $6 WHERE id = $7 RETURNING *',
                    [name, category, parseFloat(quantity), parseFloat(min_quantity), unit, parseFloat(unit_cost), id]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const idx = data.inventory.findIndex(i => i.id === parseInt(id));
        if (idx !== -1) {
            data.inventory[idx] = { ...data.inventory[idx], name, category, quantity: parseFloat(quantity), min_quantity: parseFloat(min_quantity), unit, unit_cost: parseFloat(unit_cost) };
            saveLocalData(data);
            return data.inventory[idx];
        }
        return null;
    },

    async adjustInventoryStock(id, addedQuantity, logExpense = true) {
        const item = (await this.getInventory()).find(i => i.id === parseInt(id));
        if (!item) return null;
        const newQty = Math.max(0, parseFloat(item.quantity) + parseFloat(addedQuantity));

        await this.updateInventoryItem(id, { ...item, quantity: newQty });

        if (addedQuantity > 0 && logExpense && parseFloat(item.unit_cost) > 0) {
            const costAmount = parseFloat(addedQuantity) * parseFloat(item.unit_cost);
            await this.createExpense({
                description: `Compra de ${addedQuantity} ${item.unit} de ${item.name}`,
                category: 'Produto',
                amount: costAmount,
                expense_date: new Date().toISOString().slice(0, 10),
                inventory_id: item.id,
                notes: 'Lançamento automático de reposição de estoque'
            });
        }
        return item;
    },

    async deleteInventoryItem(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM inventory WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.inventory = data.inventory.filter(i => i.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Expenses
    async getExpenses() {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC');
                return res.rows;
            } catch (e) { }
        }
        return getLocalData().expenses.sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    },

    async createExpense({ description, category = 'Produto', amount, expense_date = new Date().toISOString().slice(0, 10), inventory_id = null, notes = '' }) {
        if (!useLocalDb && pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO expenses (description, category, amount, expense_date, inventory_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                    [description, category, parseFloat(amount), expense_date, inventory_id, notes]
                );
                return res.rows[0];
            } catch (e) { }
        }
        const data = getLocalData();
        const newId = (data.expenses.length > 0 ? Math.max(...data.expenses.map(e => e.id)) : 0) + 1;
        const newExp = { id: newId, description, category, amount: parseFloat(amount), expense_date, inventory_id, notes, created_at: new Date().toISOString() };
        data.expenses.push(newExp);
        saveLocalData(data);
        return newExp;
    },

    async deleteExpense(id) {
        if (!useLocalDb && pool) {
            try {
                await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
                return true;
            } catch (e) { }
        }
        const data = getLocalData();
        data.expenses = data.expenses.filter(e => e.id !== parseInt(id));
        saveLocalData(data);
        return true;
    },

    // Relatório Financeiro Inteligente (Dia, Semana, Mês ou Período Customizado)
    async getFinancialReport(period = 'month', refDate = new Date().toISOString().slice(0, 10), startDate = null, endDate = null) {
        const bookings = await this.getBookings();
        const expenses = await this.getExpenses();

        let filteredBookings = [];
        let filteredExpenses = [];

        if (period === 'custom' && startDate && endDate) {
            filteredBookings = bookings.filter(b => b.booking_date >= startDate && b.booking_date <= endDate);
            filteredExpenses = expenses.filter(e => e.expense_date >= startDate && e.expense_date <= endDate);
        } else if (period === 'day') {
            filteredBookings = bookings.filter(b => b.booking_date === refDate);
            filteredExpenses = expenses.filter(e => e.expense_date === refDate);
        } else if (period === 'week') {
            const today = new Date(refDate + 'T00:00:00');
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - 6);
            const startStr = startOfWeek.toISOString().slice(0, 10);
            filteredBookings = bookings.filter(b => b.booking_date >= startStr && b.booking_date <= refDate);
            filteredExpenses = expenses.filter(e => e.expense_date >= startStr && e.expense_date <= refDate);
        } else {
            const yearMonth = refDate.slice(0, 7);
            filteredBookings = bookings.filter(b => b.booking_date.startsWith(yearMonth));
            filteredExpenses = expenses.filter(e => e.expense_date.startsWith(yearMonth));
        }

        const completedBookings = filteredBookings.filter(b => b.status === 'concluido');
        const grossRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
        const totalCommissions = completedBookings.reduce((sum, b) => sum + parseFloat(b.commission_amount || 0), 0);
        const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const netProfit = grossRevenue - totalCommissions - totalExpenses;

        return {
            period,
            refDate,
            startDate,
            endDate,
            grossRevenue,
            totalCommissions,
            totalExpenses,
            netProfit,
            totalBookingsCount: filteredBookings.length,
            completedBookingsCount: completedBookings.length,
            completedBookings,
            expenses: filteredExpenses
        };
    }
};

module.exports = {
    db,
    initPostgresTables
};
