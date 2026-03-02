-- Add brand color columns to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#eab308';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_color_2 TEXT DEFAULT '#6b7280';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_color_3 TEXT DEFAULT '#94a3b8';

-- Update Interior Innovations organization with theme colors
UPDATE organizations
SET brand_color = '#b0a9a4',
    brand_color_2 = '#6b7280',
    brand_color_3 = '#94a3b8'
WHERE slug = 'interior-innovations';

-- Update other existing organizations with defaults if they don't have values
UPDATE organizations
SET brand_color = '#eab308'
WHERE brand_color IS NULL;

UPDATE organizations
SET brand_color_2 = '#6b7280'
WHERE brand_color_2 IS NULL;

UPDATE organizations
SET brand_color_3 = '#94a3b8'
WHERE brand_color_3 IS NULL;

COMMENT ON COLUMN organizations.brand_color IS 'Primary brand color — buttons, nav, sidebar (hex code)';
COMMENT ON COLUMN organizations.brand_color_2 IS 'Secondary brand color — chart bars, accents (hex code)';
COMMENT ON COLUMN organizations.brand_color_3 IS 'Tertiary brand color — chart bars, stage card accents (hex code)';
