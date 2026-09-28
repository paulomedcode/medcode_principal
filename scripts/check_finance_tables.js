import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
  'finance_accounts',
  'finance_categories',
  'finance_services',
  'finance_service_sales',
  'finance_transactions',
  'finance_imported_transactions',
  'finance_doctor_settings',
  'finance_repasses',
  'finance_repasse_items',
  'finance_glosas'
];

async function checkTables() {
  console.log("Checking finance tables in Supabase...");
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table ${table}: ${error.message} (${error.code || ''})`);
    } else {
      console.log(`✅ Table ${table}: exists and accessible`);
    }
  }
}

checkTables();
