export async function onRequestPost(context) {
  const { env, request } = context;
  const { messages } = await request.json();

  try {
    // Official model ID for Gemma 4 MoE
    const result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: messages,
      // Optional: Set a higher limit if your wiki context is long
      max_tokens: 2048 
    });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Return the error to the frontend so you can see it in the console
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}