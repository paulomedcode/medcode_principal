-- Anexos do lançamento financeiro (boleto, nota fiscal, comprovante…).
-- Array JSONB de objetos { name, path, url, size, type, uploaded_at }.
-- Os arquivos ficam no bucket público "documentos" (prefixo financeiro/);
-- aqui guardamos apenas as referências.
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
