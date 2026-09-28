import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data, error } = await supabase.from('surgeries').select('id').limit(1);
    if (error) {
      console.error("Erro ao consultar surgeries:", error.message);
    } else if (data && data.length > 0) {
      console.log("ID da cirurgia:", data[0].id);
      console.log("Tipo do ID da cirurgia:", typeof data[0].id);
    } else {
      console.log("Nenhuma cirurgia encontrada para verificar o ID.");
    }
  } catch (err) {
    console.error("Erro inesperado:", err);
  }
}

check();
