import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDDL() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { 
      query: 'CREATE TABLE IF NOT EXISTS finance_dummy (id uuid primary key default gen_random_uuid(), val text); DROP TABLE finance_dummy;' 
    });
    if (error) {
      console.error("Erro ao rodar SQL via RPC:", error.message);
    } else {
      console.log("SQL executado com sucesso! Retorno:", data);
    }
  } catch (err) {
    console.error("Erro inesperado:", err);
  }
}

testDDL();
