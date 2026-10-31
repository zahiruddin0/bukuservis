DROP TABLE IF EXISTS visit_items;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS fuel_logs;
DROP TABLE IF EXISTS readings;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS service_types;
CREATE TABLE vehicles (
id            INTEGER PRIMARY KEY AUTOINCREMENT,
name          TEXT    NOT NULL,
type          TEXT    NOT NULL DEFAULT 'car',
plate         TEXT,
make          TEXT,
model         TEXT,
year          INTEGER,
odometer_base INTEGER DEFAULT 0,
created_at    TEXT
);
CREATE TABLE service_types (
id              INTEGER PRIMARY KEY AUTOINCREMENT,
code            TEXT UNIQUE,
name            TEXT    NOT NULL,
category        TEXT    DEFAULT 'lain',
applies_to      TEXT    DEFAULT 'both',
track           TEXT    DEFAULT 'interval',
interval_km     INTEGER,
interval_months INTEGER,
notes           TEXT,
sort_order      INTEGER DEFAULT 0
);
CREATE TABLE visits (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
vehicle_id  INTEGER NOT NULL,
date        TEXT    NOT NULL,
odometer    INTEGER NOT NULL,
workshop    TEXT,
extra_cost  REAL    DEFAULT 0,
notes       TEXT,
created_at  TEXT
);
CREATE TABLE visit_items (
id              INTEGER PRIMARY KEY AUTOINCREMENT,
visit_id        INTEGER NOT NULL,
service_type_id INTEGER,
custom_name     TEXT,
brand           TEXT,
product         TEXT,
kind            TEXT,
qty             REAL    DEFAULT 1,
price           REAL    DEFAULT 0,
next_due_km     INTEGER,
next_due_date   TEXT,
notes           TEXT
);
CREATE TABLE fuel_logs (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
vehicle_id  INTEGER NOT NULL,
date        TEXT    NOT NULL,
odometer    INTEGER NOT NULL,
liters      REAL    NOT NULL,
total_cost  REAL    NOT NULL,
fuel_type   TEXT,
station     TEXT,
full_tank   INTEGER DEFAULT 1,
notes       TEXT
);
CREATE TABLE readings (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
vehicle_id  INTEGER NOT NULL,
date        TEXT    NOT NULL,
odometer    INTEGER NOT NULL,
notes       TEXT
);
CREATE INDEX idx_visits_vehicle   ON visits(vehicle_id, odometer);
CREATE INDEX idx_items_visit      ON visit_items(visit_id);
CREATE INDEX idx_items_type       ON visit_items(service_type_id);
CREATE INDEX idx_fuel_vehicle     ON fuel_logs(vehicle_id, odometer);
CREATE INDEX idx_readings_vehicle ON readings(vehicle_id, odometer);
INSERT INTO service_types (code, name, category, applies_to, interval_km, interval_months, notes, sort_order) VALUES
('oil_engine_moto',  'Minyak Hitam Enjin', 'enjin',     'motorcycle', 3000,  3,    'Semak manual. Mineral ~2,000-3,000 km, full sintetik boleh lebih.', 1),
('oil_filter_moto',  'Oil Filter',         'enjin',     'motorcycle', 10000, NULL, '', 2),
('air_filter_moto',  'Penapis Udara',      'enjin',     'motorcycle', 10000, 12,   '', 3),
('spark_plug_moto',  'Spark Plug',         'enjin',     'motorcycle', 8000,  NULL, 'Iridium boleh tahan lebih lama.', 4),
('chain_moto',       'Rantai & Sproket',   'hantar',    'motorcycle', 20000, NULL, 'Periksa ketegangan setiap 500 km.', 5),
('brake_pad_moto',   'Brake Pad',          'brek',      'motorcycle', 12000, NULL, '', 6),
('brake_fluid_moto', 'Brake Fluid',        'brek',      'motorcycle', NULL,  24,   '', 7),
('coolant_moto',     'Coolant',            'penyejuk',  'motorcycle', 20000, 24,   '', 8),
('tyre_moto',        'Tayar',              'tayar',     'motorcycle', 18000, 36,   'Tukar bila bunga < 1.6 mm.', 9),
('battery_moto',     'Bateri',             'elektrik',  'motorcycle', NULL,  30,   '', 10),
('cvt_belt_moto',    'CVT Belt',           'hantar',    'motorcycle', 20000, NULL, 'Untuk skuter.', 11),
('cvt_roller_moto',  'Roller CVT',         'hantar',    'motorcycle', 15000, NULL, 'Untuk skuter.', 12);
INSERT INTO service_types (code, name, category, applies_to, interval_km, interval_months, notes, sort_order) VALUES
('oil_engine_car',   'Minyak Hitam Enjin', 'enjin',     'car', 8000,  6,    'Semak manual. Full sintetik boleh 10,000 km.', 13),
('oil_filter_car',   'Oil Filter',         'enjin',     'car', 8000,  6,    'Tukar bersama minyak hitam.', 14),
('air_filter_car',   'Penapis Udara',      'enjin',     'car', 25000, 12,   '', 15),
('cabin_filter_car', 'Penapis Cabin',      'enjin',     'car', 20000, 12,   '', 16),
('spark_plug_car',   'Spark Plug',         'enjin',     'car', 40000, NULL, 'Iridium/platinum boleh 100,000 km.', 17),
('brake_pad_car',    'Brake Pad',          'brek',      'car', 40000, NULL, '', 18),
('brake_fluid_car',  'Brake Fluid',        'brek',      'car', 40000, 24,   '', 19),
('coolant_car',      'Coolant',            'penyejuk',  'car', 60000, 36,   '', 20),
('atf_car',          'ATF / CVT Fluid',    'transmisi', 'car', 50000, NULL, '', 21),
('timing_belt_car',  'Timing Belt',        'enjin',     'car', 90000, 60,   'Jika guna timing chain, abaikan.', 22),
('tyre_car',         'Tayar',              'tayar',     'car', 45000, 60,   'Tukar bila bunga < 1.6 mm atau > 5 tahun.', 23),
('battery_car',      'Bateri',             'elektrik',  'car', NULL,  30,   '', 24),
('fuel_filter_car',  'Fuel Filter',        'enjin',     'car', 50000, NULL, '', 25);
INSERT INTO service_types (code, name, category, applies_to, track, interval_km, interval_months, notes, sort_order) VALUES
('clutch_plate_moto', 'Clutch Plate',       'hantar',    'motorcycle', 'history', NULL, NULL, 'Tukar ikut keadaan, bukan jarak tetap.', 26),
('coverset_moto',     'Coverset',           'aksesori',  'motorcycle', 'history', NULL, NULL, '', 27),
('exhaust_moto',      'Ekzos',              'aksesori',  'motorcycle', 'history', NULL, NULL, '', 28),
('suspension_moto',   'Suspension / Shock', 'hantar',    'motorcycle', 'history', NULL, NULL, '', 29),
('clutch_plate_car',  'Clutch Plate',       'transmisi', 'car',        'history', NULL, NULL, 'Tukar ikut keadaan, bukan jarak tetap.', 30),
('suspension_car',    'Suspension / Absorber', 'hantar', 'car',        'history', NULL, NULL, '', 31),
('water_pump_car',    'Water Pump',         'penyejuk',  'car',        'history', NULL, NULL, '', 32),
('alternator_car',    'Alternator',         'elektrik',  'car',        'history', NULL, NULL, '', 33),
('starter_car',       'Starter',            'elektrik',  'car',        'history', NULL, NULL, '', 34),
('radiator_car',      'Radiator',           'penyejuk',  'car',        'history', NULL, NULL, '', 35),
('exhaust_car',       'Ekzos',              'aksesori',  'car',        'history', NULL, NULL, '', 36);