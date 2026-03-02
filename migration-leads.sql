-- ============================================================
-- LEADS MANAGEMENT MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- TABLE: lead_stages
CREATE TABLE IF NOT EXISTS lead_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#6b7280',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_won          BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES user_profiles(id),
  updated_by      UUID REFERENCES user_profiles(id),
  UNIQUE (organization_id, name),
  CONSTRAINT one_type_per_stage CHECK (NOT (is_won AND is_lost))
);

ALTER TABLE lead_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_stages_select" ON lead_stages
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "lead_stages_insert" ON lead_stages
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "lead_stages_update" ON lead_stages
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "lead_stages_delete" ON lead_stages
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role = 'admin'
    )
  );

-- Super admin bypass for lead_stages
CREATE POLICY "super_admin_lead_stages" ON lead_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- TABLE: lead_sources
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES user_profiles(id),
  updated_by      UUID REFERENCES user_profiles(id),
  UNIQUE (organization_id, name)
);

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_select" ON lead_sources
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "lead_sources_insert" ON lead_sources
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "lead_sources_delete" ON lead_sources
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role = 'admin'
    )
  );

-- Super admin bypass for lead_sources
CREATE POLICY "super_admin_lead_sources" ON lead_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- TABLE: leads
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  address              TEXT,
  notes                TEXT,
  stage_id             UUID REFERENCES lead_stages(id) ON DELETE SET NULL,
  source_id            UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
  assigned_to          UUID REFERENCES user_profiles(id),
  estimated_value      DECIMAL(12,2),
  converted_client_id  INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  created_by           UUID REFERENCES user_profiles(id),
  updated_by           UUID REFERENCES user_profiles(id)
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "leads_delete" ON leads
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role = 'admin'
    )
  );

-- Super admin bypass for leads
CREATE POLICY "super_admin_leads" ON leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- TABLE: lead_activities
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('call_message', 'email', 'site_visit_meeting', 'note')),
  summary         TEXT NOT NULL,
  notes           TEXT,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES user_profiles(id),
  updated_by      UUID REFERENCES user_profiles(id)
);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_select" ON lead_activities
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "lead_activities_insert" ON lead_activities
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "lead_activities_delete" ON lead_activities
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role = 'admin'
    )
  );

-- Super admin bypass for lead_activities
CREATE POLICY "super_admin_lead_activities" ON lead_activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- SEED DEFAULT DATA for existing organizations
-- ============================================================
INSERT INTO lead_stages (organization_id, name, color, sort_order, is_won, is_lost)
SELECT o.id, s.name, s.color, s.sort_order, s.is_won, s.is_lost
FROM organizations o
CROSS JOIN (VALUES
  ('New Lead',       '#6b7280', 1, FALSE, FALSE),
  ('Contacted',      '#3b82f6', 2, FALSE, FALSE),
  ('Qualified',      '#8b5cf6', 3, FALSE, FALSE),
  ('Proposal Sent',  '#f59e0b', 4, FALSE, FALSE),
  ('Negotiating',    '#f97316', 5, FALSE, FALSE),
  ('Won',            '#22c55e', 6, TRUE,  FALSE),
  ('Lost',           '#ef4444', 7, FALSE, TRUE)
) AS s(name, color, sort_order, is_won, is_lost)
WHERE o.status = 'active'
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO lead_sources (organization_id, name)
SELECT o.id, s.name
FROM organizations o
CROSS JOIN (VALUES
  ('Referral'), ('Instagram'), ('Website'), ('Walk-in'), ('Cold Outreach')
) AS s(name)
WHERE o.status = 'active'
ON CONFLICT (organization_id, name) DO NOTHING;

-- ============================================================
-- TRIGGER: Auto-seed defaults for new organizations
-- ============================================================
CREATE OR REPLACE FUNCTION seed_lead_defaults_for_new_org()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lead_stages (organization_id, name, color, sort_order, is_won, is_lost) VALUES
    (NEW.id, 'New Lead',       '#6b7280', 1, FALSE, FALSE),
    (NEW.id, 'Contacted',      '#3b82f6', 2, FALSE, FALSE),
    (NEW.id, 'Qualified',      '#8b5cf6', 3, FALSE, FALSE),
    (NEW.id, 'Proposal Sent',  '#f59e0b', 4, FALSE, FALSE),
    (NEW.id, 'Negotiating',    '#f97316', 5, FALSE, FALSE),
    (NEW.id, 'Won',            '#22c55e', 6, TRUE,  FALSE),
    (NEW.id, 'Lost',           '#ef4444', 7, FALSE, TRUE)
  ON CONFLICT DO NOTHING;

  INSERT INTO lead_sources (organization_id, name) VALUES
    (NEW.id, 'Referral'),
    (NEW.id, 'Instagram'),
    (NEW.id, 'Website'),
    (NEW.id, 'Walk-in'),
    (NEW.id, 'Cold Outreach')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists from previous run
DROP TRIGGER IF EXISTS on_organization_created_seed_leads ON organizations;

CREATE TRIGGER on_organization_created_seed_leads
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_lead_defaults_for_new_org();
