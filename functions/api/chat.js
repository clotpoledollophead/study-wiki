export async function onRequestPost(context) {
  const { request, env } = context;
  const { messages } = await request.json();

  try {
    // Calling the exact Gemma 4 MoE model ID
    const aiResponse = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: messages
    });

    // Log the response to your Cloudflare dashboard for debugging
    console.log("AI Result:", JSON.stringify(aiResponse));

    return new Response(JSON.stringify(aiResponse), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}