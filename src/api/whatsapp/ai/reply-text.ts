// O modelo às vezes devolve a mesma mensagem duas vezes no mesmo conteúdo.
function collapseRepeated(text: string): string {
  const half = text.length / 2;
  for (let cut = Math.floor(half) - 2; cut <= Math.ceil(half) + 2; cut++) {
    if (cut <= 0 || cut >= text.length) continue;
    const first = text.slice(0, cut).trim();
    if (first.length > 20 && first === text.slice(cut).trim()) return first;
  }
  return text;
}

// O WhatsApp só entende *negrito* com um asterisco; **assim** aparece com os asteriscos sobrando.
function whatsappBold(text: string): string {
  return text.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*").replace(/__([^_\n]+?)__/g, "_$1_");
}

export function collapseRepeatedReply(text: string): string {
  return whatsappBold(collapseRepeated(text));
}
