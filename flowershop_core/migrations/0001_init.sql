-- Flower Shop schema v1. Money = integer minor units; quantities = integer milli-units.
CREATE TABLE business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'florist',
  currency TEXT NOT NULL DEFAULT 'IDR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  location TEXT NOT NULL DEFAULT '',
  business_hours TEXT NOT NULL DEFAULT '08:00-20:00',
  enabled_departments TEXT NOT NULL DEFAULT '["sales","inventory","production","finance","logistics"]',
  onboarding_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_customers_phone ON customers(phone);

CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('flower','foliage','wrapping','ribbon','card','vase','other')),
  variety TEXT, color TEXT,
  unit TEXT NOT NULL DEFAULT 'stem',
  on_hand_milli INTEGER NOT NULL DEFAULT 0,
  reserved_milli INTEGER NOT NULL DEFAULT 0,
  reorder_threshold_milli INTEGER NOT NULL DEFAULT 0,
  avg_unit_cost_minor INTEGER NOT NULL DEFAULT 0,
  supplier TEXT,
  freshness_window_days INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  -- Hard guards: the database itself refuses over-reservation and negative stock.
  CHECK (on_hand_milli >= 0),
  CHECK (reserved_milli >= 0),
  CHECK (reserved_milli <= on_hand_milli)
);

CREATE TABLE inventory_movements (
  id INTEGER PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt','reservation','release','consumption','adjustment','wastage')),
  quantity_milli INTEGER NOT NULL,
  unit_cost_minor INTEGER,
  reference_type TEXT, reference_id INTEGER,
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_movements_item ON inventory_movements(inventory_item_id, id);
CREATE TRIGGER movements_append_only BEFORE UPDATE ON inventory_movements
BEGIN SELECT RAISE(ABORT, 'inventory_movements is append-only; record a compensating movement'); END;

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_price_minor INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE recipe_components (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  qty_per_unit_milli INTEGER NOT NULL CHECK (qty_per_unit_milli > 0),
  wastage_bp INTEGER NOT NULL DEFAULT 0 CHECK (wastage_bp >= 0 AND wastage_bp <= 10000)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL,
  held_from_status TEXT,
  requested_delivery_at TEXT,
  delivery_address TEXT,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_due ON orders(requested_delivery_at);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  est_unit_cost_minor INTEGER,
  line_total_minor INTEGER NOT NULL,
  design_reference_id INTEGER
);

CREATE TABLE order_status_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_history_order ON order_status_history(order_id, id);

CREATE TABLE production_tasks (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  blocked_from TEXT,
  scheduled_start TEXT, scheduled_due TEXT,
  assigned_to TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_tasks_order ON production_tasks(order_id);

CREATE TABLE production_task_materials (
  id INTEGER PRIMARY KEY,
  production_task_id INTEGER NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  required_milli INTEGER NOT NULL,
  reserved_milli INTEGER NOT NULL DEFAULT 0,
  consumed_milli INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  paid_at TEXT NOT NULL,
  reference TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payment_method TEXT, reference TEXT,
  created_by TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  address TEXT, recipient_name TEXT, recipient_phone TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE design_references (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('generated_image','canvas','uploaded_reference')),
  asset_path TEXT, prompt TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE approvals (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  summary TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT NOT NULL,
  decided_by TEXT, decision_note TEXT,
  result TEXT, error TEXT,
  entity_type TEXT, entity_id INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, decided_at TEXT
);
CREATE INDEX ix_approvals_status ON approvals(status);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL, entity_id INTEGER,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  before_state TEXT, after_state TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX ix_audit_actor ON audit_events(actor, id);
