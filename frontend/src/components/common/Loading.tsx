export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
      {text}
    </div>
  );
}
