ALTER TABLE children
  ADD COLUMN shape_key TEXT NOT NULL DEFAULT 'circle'
  CHECK (shape_key IN ('circle', 'star', 'square', 'heart', 'diamond', 'triangle', 'hexagon'));
