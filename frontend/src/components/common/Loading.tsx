export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-zinc-400">
      <div className="animate-spin w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full" />
      <span className="font-light">{text}</span>
    </div>
  );
}
