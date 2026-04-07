export async function onRequestPost(context) {
  const { request, env } = context;
  
  // 1. Parse the user request
  const { messages } = await request.json();

  try {
    // 2. Call Gemma 4 via Workers AI
    const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: messages,
      stream: false // Set to true if you want to implement streaming later
    });

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}