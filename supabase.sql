-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.contracts CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.labors CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- Clients table
CREATE TABLE public.clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  contract_amount DECIMAL(12,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Vendors table
CREATE TABLE public.vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  notes TEXT, -- Added notes column
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Labors table
CREATE TABLE public.labors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialization TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Tasks table
CREATE TABLE public.tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled')) DEFAULT 'Not Started',
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create contracts table
CREATE TABLE public.contracts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES public.vendors(id) ON DELETE CASCADE,
  labor_id INTEGER REFERENCES public.labors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  contract_amount DECIMAL(12,2) NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  -- Ensure contract is either with vendor or labor, not both
  CONSTRAINT contracts_party_check CHECK (
    (vendor_id IS NOT NULL AND labor_id IS NULL) OR
    (vendor_id IS NULL AND labor_id IS NOT NULL)
  )
);

-- Update payments table to link with contracts and clients
CREATE TABLE public.payments (
  id SERIAL PRIMARY KEY,
  amount DECIMAL(12,2) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('client', 'vendor', 'labor')),
  contract_id INTEGER REFERENCES public.contracts(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE, -- Added client_id for direct client payments
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add documents table after payments table, before triggers
CREATE TABLE public.documents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_labors_updated_at
    BEFORE UPDATE ON public.labors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add documents trigger before enabling RLS
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- Enable Row Level Security (RLS)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Add RLS for documents before creating policies
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create policies for clients
CREATE POLICY "Enable read access for authenticated users" ON public.clients
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.clients
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.clients
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.clients
    FOR DELETE USING (true);

-- Create policies for vendors
CREATE POLICY "Enable read access for authenticated users" ON public.vendors
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.vendors
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.vendors
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.vendors
    FOR DELETE USING (true);

-- Create policies for labors
CREATE POLICY "Enable read access for authenticated users" ON public.labors
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.labors
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.labors
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.labors
    FOR DELETE USING (true);

-- Create policies for tasks
CREATE POLICY "Enable read access for authenticated users" ON public.tasks
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.tasks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.tasks
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.tasks
    FOR DELETE USING (true);

-- Create policies for payments
CREATE POLICY "Enable read access for authenticated users" ON public.payments
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.payments
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.payments
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.payments
    FOR DELETE USING (true);

-- Create policies for contracts
CREATE POLICY "Enable read access for authenticated users" ON public.contracts
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.contracts
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.contracts
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.contracts
    FOR DELETE USING (true);

-- Add documents policies before indexes
CREATE POLICY "Enable read access for authenticated users" ON public.documents
    FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.documents
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.documents
    FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.documents
    FOR DELETE USING (true);

-- Create indexes for better performance
CREATE INDEX idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX idx_contracts_vendor_id ON public.contracts(vendor_id);
CREATE INDEX idx_contracts_labor_id ON public.contracts(labor_id);
CREATE INDEX idx_payments_contract_id ON public.payments(contract_id);
CREATE INDEX idx_payments_client_id ON public.payments(client_id); -- Added index for client_id