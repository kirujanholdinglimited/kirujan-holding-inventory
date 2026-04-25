import { supabase } from "./supabase";

export default async function Home() {
  const { data, error } = await supabase.from("products").select("*").limit(1);

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Supabase Test</h1>

      {error && (
        <p className="text-red-500 mt-4">
          Error: {error.message}
        </p>
      )}

      {data && (
        <pre className="mt-4">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}